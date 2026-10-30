use serde::{Deserialize, Serialize};

pub const DEFAULT_GITHUB_API_URL: &str = "https://api.github.com";

pub fn get_github_api_url() -> String {
    std::env::var("GITSHOW_GITHUB_API_URL")
        .unwrap_or_else(|_| DEFAULT_GITHUB_API_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn format_auth_header(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        None
    } else if trimmed.starts_with("Bearer ") {
        Some(trimmed.to_string())
    } else {
        Some(format!("Bearer {trimmed}"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullRequestItem {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub state: String,
    pub head_ref: String,
    pub base_ref: String,
    pub comments_count: u32,
    pub review_decision: Option<String>,
}

#[derive(Deserialize)]
struct GraphQLResponse {
    data: Option<GraphQLData>,
    errors: Option<Vec<GraphQLError>>,
}

#[derive(Deserialize)]
struct GraphQLError {
    message: String,
}

#[derive(Deserialize)]
struct GraphQLData {
    repository: Option<RepositoryNode>,
}

#[derive(Deserialize)]
struct RepositoryNode {
    #[serde(rename = "pullRequests")]
    pull_requests: Option<PullRequestConnection>,
}

#[derive(Deserialize)]
struct PullRequestConnection {
    nodes: Option<Vec<Option<PullRequestNode>>>,
}

#[derive(Deserialize)]
struct PullRequestNode {
    number: u64,
    title: String,
    author: Option<AuthorNode>,
    state: String,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    #[serde(rename = "baseRefName")]
    base_ref_name: String,
    #[serde(rename = "totalCommentsCount", default)]
    total_comments_count: u32,
    #[serde(rename = "reviewDecision")]
    review_decision: Option<String>,
}

#[derive(Deserialize)]
struct AuthorNode {
    login: String,
}

const PR_QUERY: &str = "query($owner: String!, $name: String!) { \
    repository(owner: $owner, name: $name) { \
        pullRequests(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { \
            nodes { \
                number \
                title \
                author { login } \
                state \
                headRefName \
                baseRefName \
                totalCommentsCount \
                reviewDecision \
            } \
        } \
    } \
}";

pub async fn fetch_pull_requests(
    owner: &str,
    repo: &str,
    token: &str,
) -> Result<Vec<PullRequestItem>, String> {
    let base_url = get_github_api_url();
    let url = format!("{base_url}/graphql");

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "query": PR_QUERY,
        "variables": {
            "owner": owner,
            "name": repo,
        }
    });

    let mut req = client
        .post(&url)
        .header("User-Agent", "GitShow")
        .header("Accept", "application/json")
        .json(&body);

    if let Some(auth) = format_auth_header(token) {
        req = req.header("Authorization", auth);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Network error querying GraphQL API: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    if !status.is_success() {
        return Err(format!("HTTP error {status}: {text}"));
    }

    let parsed: GraphQLResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse GraphQL response: {e} (body: {text})"))?;

    if let Some(errors) = parsed.errors {
        if !errors.is_empty() {
            let msg = errors
                .iter()
                .map(|e| e.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!("GraphQL error: {msg}"));
        }
    }

    let repo_node = parsed
        .data
        .and_then(|d| d.repository)
        .ok_or_else(|| "Repository not found or access denied".to_string())?;

    let pr_nodes = repo_node
        .pull_requests
        .and_then(|pr| pr.nodes)
        .unwrap_or_default();

    let items = pr_nodes
        .into_iter()
        .flatten()
        .map(|node| PullRequestItem {
            number: node.number,
            title: node.title,
            author: node
                .author
                .map(|a| a.login)
                .unwrap_or_else(|| "ghost".to_string()),
            state: node.state,
            head_ref: node.head_ref_name,
            base_ref: node.base_ref_name,
            comments_count: node.total_comments_count,
            review_decision: node.review_decision,
        })
        .collect();

    Ok(items)
}

pub async fn fetch_pr_diff(
    owner: &str,
    repo: &str,
    pr_number: u64,
    token: &str,
) -> Result<String, String> {
    let base_url = get_github_api_url();
    let url = format!("{base_url}/repos/{owner}/{repo}/pulls/{pr_number}");

    let client = reqwest::Client::new();
    let mut req = client
        .get(&url)
        .header("User-Agent", "GitShow")
        .header("Accept", "application/vnd.github.v3.diff");

    if let Some(auth) = format_auth_header(token) {
        req = req.header("Authorization", auth);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Network error fetching PR diff: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read PR diff response: {e}"))?;

    if !status.is_success() {
        return Err(format!("HTTP error {status}: {text}"));
    }

    Ok(text)
}
