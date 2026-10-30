use crate::commands::git_cli::CliExecutionResult;
use crate::commands::rebase::RebaseItem;
use crate::engine::dag::DagCommit;
use crate::engine::repo::{BranchInfo, RepoInfo, TagInfo};
use crate::engine::undo::UndoSnapshot;
use crate::github::auth::DeviceCodeResponse;
use crate::github::graphql::PullRequestItem;

#[tauri::command]
pub fn open_repository(path: String) -> Result<RepoInfo, String> {
    crate::engine::repo::open_repository(&path)
}

#[tauri::command]
pub fn list_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    crate::engine::repo::list_branches(&path)
}

#[tauri::command]
pub fn list_tags(path: String) -> Result<Vec<TagInfo>, String> {
    crate::engine::repo::list_tags(&path)
}

#[tauri::command]
pub fn build_commit_graph(
    repo_path: String,
    max_count: Option<usize>,
) -> Result<Vec<DagCommit>, String> {
    crate::engine::dag::build_commit_graph(&repo_path, max_count.unwrap_or(1000))
}

#[tauri::command]
pub async fn execute_git_command(
    repo_path: String,
    args: Vec<String>,
) -> Result<CliExecutionResult, String> {
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    crate::commands::git_cli::execute_git_command_with_lock(
        crate::engine::lock::RepoLockManager::global(),
        &repo_path,
        &args_ref,
    )
    .await
}

#[tauri::command]
pub fn preview_command(args: Vec<String>) -> String {
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    crate::commands::git_cli::preview_command(&args_ref)
}

#[tauri::command]
pub async fn capture_pre_mutation_snapshot(
    repo_path: String,
    action: String,
) -> Result<UndoSnapshot, String> {
    crate::engine::undo::capture_pre_mutation_snapshot(&repo_path, &action).await
}

#[tauri::command]
pub async fn rollback_snapshot(
    repo_path: String,
    snapshot_id: String,
) -> Result<String, String> {
    crate::engine::undo::rollback_snapshot(&repo_path, &snapshot_id).await
}

#[tauri::command]
pub fn get_undo_stack(repo_path: String) -> Vec<UndoSnapshot> {
    crate::engine::undo::get_undo_stack(&repo_path)
}

#[tauri::command]
pub async fn execute_interactive_rebase(
    repo: String,
    base_sha: String,
    items: Vec<RebaseItem>,
) -> Result<(), String> {
    crate::commands::rebase::execute_interactive_rebase(&repo, &base_sha, items).await
}

#[tauri::command]
pub async fn fetch_pull_requests(
    owner: String,
    repo: String,
    token: Option<String>,
) -> Result<Vec<PullRequestItem>, String> {
    let auth_token = match token {
        Some(t) if !t.is_empty() => t,
        _ => crate::github::auth::get_token()?.unwrap_or_default(),
    };
    crate::github::graphql::fetch_pull_requests(&owner, &repo, &auth_token).await
}

#[tauri::command]
pub async fn fetch_pr_diff(
    owner: String,
    repo: String,
    pr_number: u64,
    token: Option<String>,
) -> Result<String, String> {
    let auth_token = match token {
        Some(t) if !t.is_empty() => t,
        _ => crate::github::auth::get_token()?.unwrap_or_default(),
    };
    crate::github::graphql::fetch_pr_diff(&owner, &repo, pr_number, &auth_token).await
}

#[tauri::command]
pub async fn request_device_code(client_id: String) -> Result<DeviceCodeResponse, String> {
    crate::github::auth::request_device_code(&client_id).await
}

#[tauri::command]
pub async fn poll_for_access_token(
    client_id: String,
    device_code: String,
    interval: u64,
) -> Result<String, String> {
    crate::github::auth::poll_for_access_token(&client_id, &device_code, interval).await
}

#[tauri::command]
pub fn get_token() -> Result<Option<String>, String> {
    crate::github::auth::get_token()
}

#[tauri::command]
pub fn store_token(token: String) -> Result<(), String> {
    crate::github::auth::store_token(&token)
}

#[tauri::command]
pub fn remove_token() -> Result<(), String> {
    crate::github::auth::remove_token()
}

#[tauri::command]
pub fn create_pty_session(cwd: String, cols: u16, rows: u16) -> Result<u32, String> {
    crate::terminal::pty::PtySessionManager::global().create_session(&cwd, cols, rows)
}

#[tauri::command]
pub fn write_to_pty(session_id: u32, data: Vec<u8>) -> Result<(), String> {
    crate::terminal::pty::PtySessionManager::global().write(session_id, &data)
}

#[tauri::command]
pub fn read_from_pty(session_id: u32) -> Result<Vec<u8>, String> {
    crate::terminal::pty::PtySessionManager::global().read(session_id)
}

#[tauri::command]
pub fn resize_pty(session_id: u32, cols: u16, rows: u16) -> Result<(), String> {
    crate::terminal::pty::PtySessionManager::global().resize(session_id, cols, rows)
}

#[tauri::command]
pub fn close_pty_session(session_id: u32) -> Result<(), String> {
    crate::terminal::pty::PtySessionManager::global().close_session(session_id)
}
