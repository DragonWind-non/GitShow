use crate::engine::lock::RepoLockManager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CliExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub preview_command: String,
}

pub fn preview_command(args: &[&str]) -> String {
    let mut parts = vec!["git".to_string()];
    for arg in args {
        if arg.is_empty() || arg.chars().any(|c| c.is_whitespace() || c == '"') {
            parts.push(format!("\"{}\"", arg.replace('"', "\\\"")));
        } else {
            parts.push(arg.to_string());
        }
    }
    parts.join(" ")
}

pub async fn execute_git_command(
    repo_path: &str,
    args: &[&str],
) -> Result<CliExecutionResult, String> {
    let preview = preview_command(args);

    let mut cmd = tokio::process::Command::new("git");
    cmd.args(args)
        .current_dir(repo_path)
        .env("GIT_TERMINAL_PROMPT", "0");

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute git CLI command: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(CliExecutionResult {
        stdout,
        stderr,
        exit_code,
        preview_command: preview,
    })
}

pub async fn execute_git_command_with_lock(
    lock_manager: &RepoLockManager,
    repo_path: &str,
    args: &[&str],
) -> Result<CliExecutionResult, String> {
    lock_manager
        .with_mutation_lock(repo_path, || execute_git_command(repo_path, args))
        .await
}
