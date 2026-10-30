use git2::{BranchType, Repository, StatusOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoInfo {
    pub path: String,
    pub current_branch: Option<String>,
    pub is_detached: bool,
    pub is_clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub target_commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagInfo {
    pub name: String,
    pub target_commit: String,
    pub message: Option<String>,
}

pub fn open_repository(path: &str) -> Result<RepoInfo, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;

    let is_detached = repo.head_detached().unwrap_or(false);

    let current_branch = if is_detached {
        None
    } else {
        match repo.head() {
            Ok(head) => head.shorthand().map(|s| s.to_string()),
            Err(_) => repo
                .find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().map(|target| {
                    target
                        .strip_prefix("refs/heads/")
                        .unwrap_or(target)
                        .to_string()
                })),
        }
    };

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true);
    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| e.to_string())?;
    let is_clean = statuses.is_empty();

    let repo_path = repo
        .workdir()
        .map(|p| p.to_string_lossy().trim_end_matches(['/', '\\']).to_string())
        .unwrap_or_else(|| path.to_string());

    Ok(RepoInfo {
        path: repo_path,
        current_branch,
        is_detached,
        is_clean,
    })
}

pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let mut branches_info = Vec::new();

    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    for item in branches {
        let (branch, branch_type) = item.map_err(|e| e.to_string())?;
        let is_remote = branch_type == BranchType::Remote;
        let is_current = if is_remote { false } else { branch.is_head() };

        let name = branch
            .name()
            .map_err(|e| e.to_string())?
            .unwrap_or("")
            .to_string();

        let target_commit = branch
            .get()
            .peel_to_commit()
            .map(|c| c.id().to_string())
            .ok()
            .or_else(|| branch.get().target().map(|oid| oid.to_string()))
            .unwrap_or_default();

        branches_info.push(BranchInfo {
            name,
            is_current,
            is_remote,
            target_commit,
        });
    }

    Ok(branches_info)
}

pub fn list_tags(path: &str) -> Result<Vec<TagInfo>, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let mut tags = Vec::new();

    let tag_names = repo.tag_names(None).map_err(|e| e.to_string())?;
    for name in tag_names.iter().flatten() {
        if let Ok(obj) = repo.revparse_single(name) {
            let target_commit = obj
                .peel(git2::ObjectType::Commit)
                .map(|c| c.id().to_string())
                .unwrap_or_else(|_| obj.id().to_string());
            let message = obj.as_tag().and_then(|t| t.message().map(String::from));

            tags.push(TagInfo {
                name: name.to_string(),
                target_commit,
                message,
            });
        }
    }

    tags.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tags)
}
