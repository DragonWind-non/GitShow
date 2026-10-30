use gitshow_lib::github::graphql::{fetch_pr_diff, fetch_pull_requests, PullRequestItem};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

static SERIAL_TEST_LOCK: Mutex<()> = Mutex::const_new(());

struct MockRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}

struct MockResponse {
    status: u16,
    content_type: &'static str,
    body: String,
}

impl MockResponse {
    fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            content_type: "application/json",
            body: body.to_string(),
        }
    }

    fn diff(status: u16, body: &str) -> Self {
        Self {
            status,
            content_type: "application/vnd.github.v3.diff",
            body: body.to_string(),
        }
    }
}

async fn spawn_mock_server<F>(handler: F) -> (String, tokio::task::JoinHandle<()>)
where
    F: Fn(MockRequest) -> MockResponse + Send + Sync + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind mock server");
    let addr = listener.local_addr().expect("failed to get local addr");
    let base_url = format!("http://127.0.0.1:{}", addr.port());

    let handler = Arc::new(handler);
    let handle = tokio::spawn(async move {
        loop {
            let (mut socket, _) = match listener.accept().await {
                Ok(conn) => conn,
                Err(_) => break,
            };

            let handler = Arc::clone(&handler);
            tokio::spawn(async move {
                let mut buffer = [0u8; 8192];
                let mut total_read = 0;
                let mut header_end = None;

                while total_read < buffer.len() {
                    let n = match socket.read(&mut buffer[total_read..]).await {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => return,
                    };
                    total_read += n;

                    if let Some(pos) = buffer[..total_read]
                        .windows(4)
                        .position(|w| w == b"\r\n\r\n")
                    {
                        header_end = Some(pos);
                        break;
                    }
                }

                if let Some(h_end) = header_end {
                    let req_str = String::from_utf8_lossy(&buffer[..h_end]);
                    let mut lines = req_str.lines();
                    let first_line = lines.next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    let method = parts.first().copied().unwrap_or("GET").to_string();
                    let path = parts.get(1).copied().unwrap_or("/").to_string();

                    let mut headers = HashMap::new();
                    let mut content_length = 0;
                    for line in lines {
                        if let Some((k, v)) = line.split_once(':') {
                            let key = k.trim().to_lowercase();
                            let val = v.trim().to_string();
                            if key == "content-length" {
                                content_length = val.parse().unwrap_or(0);
                            }
                            headers.insert(key, val);
                        }
                    }

                    let body_start = h_end + 4;
                    let mut body_bytes = buffer[body_start..total_read].to_vec();
                    while body_bytes.len() < content_length {
                        let mut chunk = vec![0u8; content_length - body_bytes.len()];
                        match socket.read(&mut chunk).await {
                            Ok(0) => break,
                            Ok(n) => body_bytes.extend_from_slice(&chunk[..n]),
                            Err(_) => break,
                        }
                    }
                    let body = String::from_utf8_lossy(&body_bytes).to_string();

                    let req = MockRequest {
                        method,
                        path,
                        headers,
                        body,
                    };

                    let resp = handler(req);
                    let reason = match resp.status {
                        200 => "OK",
                        400 => "Bad Request",
                        401 => "Unauthorized",
                        403 => "Forbidden",
                        404 => "Not Found",
                        500 => "Internal Server Error",
                        _ => "Response",
                    };

                    let response = format!(
                        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        resp.status,
                        reason,
                        resp.content_type,
                        resp.body.len(),
                        resp.body
                    );

                    let _ = socket.write_all(response.as_bytes()).await;
                }
            });
        }
    });

    (base_url, handle)
}

#[tokio::test]
async fn test_fetch_pull_requests_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|req| {
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/graphql");
        assert_eq!(
            req.headers.get("authorization").map(String::as_str),
            Some("Bearer mock_token_xyz")
        );
        assert_eq!(
            req.headers.get("user-agent").map(String::as_str),
            Some("GitShow")
        );

        let body_val: serde_json::Value =
            serde_json::from_str(&req.body).expect("invalid graphql body");
        let query = body_val["query"].as_str().expect("missing query");
        assert!(query.contains("pullRequests"));

        MockResponse::json(
            200,
            r#"{
                "data": {
                    "repository": {
                        "pullRequests": {
                            "nodes": [
                                {
                                    "number": 101,
                                    "title": "feat: PR Studio UI",
                                    "author": { "login": "alice" },
                                    "state": "OPEN",
                                    "headRefName": "feat/pr-studio",
                                    "baseRefName": "main",
                                    "totalCommentsCount": 5,
                                    "reviewDecision": "APPROVED"
                                },
                                {
                                    "number": 100,
                                    "title": "fix: race condition",
                                    "author": null,
                                    "state": "MERGED",
                                    "headRefName": "fix/race",
                                    "baseRefName": "main",
                                    "totalCommentsCount": 0,
                                    "reviewDecision": null
                                }
                            ]
                        }
                    }
                }
            }"#,
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let prs = fetch_pull_requests("owner_foo", "repo_bar", "mock_token_xyz")
        .await
        .expect("fetch_pull_requests should succeed");

    assert_eq!(prs.len(), 2);
    assert_eq!(
        prs[0],
        PullRequestItem {
            number: 101,
            title: "feat: PR Studio UI".to_string(),
            author: "alice".to_string(),
            state: "OPEN".to_string(),
            head_ref: "feat/pr-studio".to_string(),
            base_ref: "main".to_string(),
            comments_count: 5,
            review_decision: Some("APPROVED".to_string()),
        }
    );
    assert_eq!(
        prs[1],
        PullRequestItem {
            number: 100,
            title: "fix: race condition".to_string(),
            author: "ghost".to_string(),
            state: "MERGED".to_string(),
            head_ref: "fix/race".to_string(),
            base_ref: "main".to_string(),
            comments_count: 0,
            review_decision: None,
        }
    );

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_empty_list() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|req| {
        assert_eq!(req.path, "/graphql");
        MockResponse::json(
            200,
            r#"{
                "data": {
                    "repository": {
                        "pullRequests": {
                            "nodes": []
                        }
                    }
                }
            }"#,
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let prs = fetch_pull_requests("owner_foo", "empty_repo", "token123")
        .await
        .expect("empty pull requests list should succeed");

    assert_eq!(prs, Vec::<PullRequestItem>::new());

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_graphql_error() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|_| {
        MockResponse::json(
            200,
            r#"{
                "errors": [
                    { "message": "Could not resolve to a Repository with the name 'owner_foo/nonexistent'." }
                ]
            }"#,
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let res = fetch_pull_requests("owner_foo", "nonexistent", "token123").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("Could not resolve to a Repository"));

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_http_error_401() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|_| {
        MockResponse::json(401, r#"{"message": "Bad credentials"}"#)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let res = fetch_pull_requests("owner_foo", "repo_bar", "invalid_token").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("401") || err.contains("Bad credentials"));

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_http_error_403_rate_limit() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|_| {
        MockResponse::json(403, r#"{"message": "API rate limit exceeded"}"#)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let res = fetch_pull_requests("owner_foo", "repo_bar", "token_rate_limited").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("403") || err.contains("rate limit"));

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_http_error_404() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|_| {
        MockResponse::json(404, r#"{"message": "Not Found"}"#)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let res = fetch_pull_requests("owner_foo", "repo_bar", "token123").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("404"));

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pull_requests_network_failure() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    // Use an unassigned port
    std::env::set_var("GITSHOW_GITHUB_API_URL", "http://127.0.0.1:1");

    let res = fetch_pull_requests("owner_foo", "repo_bar", "token123").await;
    assert!(res.is_err());
}

#[tokio::test]
async fn test_fetch_pr_diff_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let expected_diff = "diff --git a/src/lib.rs b/src/lib.rs\nindex abc1234..def5678 100644\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,3 +1,4 @@\n pub mod auth;\n+pub mod graphql;\n";

    let (base_url, server_handle) = spawn_mock_server(move |req| {
        assert_eq!(req.method, "GET");
        assert_eq!(req.path, "/repos/owner_foo/repo_bar/pulls/42");
        assert_eq!(
            req.headers.get("accept").map(String::as_str),
            Some("application/vnd.github.v3.diff")
        );
        assert_eq!(
            req.headers.get("authorization").map(String::as_str),
            Some("Bearer diff_token_456")
        );
        assert_eq!(
            req.headers.get("user-agent").map(String::as_str),
            Some("GitShow")
        );

        MockResponse::diff(200, expected_diff)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let diff = fetch_pr_diff("owner_foo", "repo_bar", 42, "diff_token_456")
        .await
        .expect("fetch_pr_diff should succeed");

    assert_eq!(diff, expected_diff);

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pr_diff_unauthenticated_omits_authorization_header() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let expected_diff = "diff --git a/README.md b/README.md\n";

    let (base_url, server_handle) = spawn_mock_server(move |req| {
        assert_eq!(req.method, "GET");
        assert_eq!(req.path, "/repos/owner_foo/repo_bar/pulls/77");
        assert_eq!(req.headers.get("authorization"), None);
        MockResponse::diff(200, expected_diff)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let diff = fetch_pr_diff("owner_foo", "repo_bar", 77, "")
        .await
        .expect("unauthenticated fetch_pr_diff should succeed without Authorization header");

    assert_eq!(diff, expected_diff);

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pr_diff_404_not_found() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|req| {
        assert_eq!(req.path, "/repos/owner_foo/repo_bar/pulls/999");
        MockResponse::json(404, r#"{"message": "Not Found"}"#)
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", &base_url);

    let res = fetch_pr_diff("owner_foo", "repo_bar", 999, "token123").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("404"));

    server_handle.abort();
}

#[tokio::test]
async fn test_fetch_pr_diff_network_failure() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    std::env::set_var("GITSHOW_GITHUB_API_URL", "http://127.0.0.1:1");

    let res = fetch_pr_diff("owner_foo", "repo_bar", 42, "token123").await;
    assert!(res.is_err());
}
