use crate::engine::lock::RepoLockManager;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TempFileGuard(PathBuf);

impl TempFileGuard {
    fn new(prefix: &str, suffix: &str) -> Self {
        let id = std::process::id();
        let cnt = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("{prefix}{id}_{cnt}{suffix}"));
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RebaseItem {
    pub action: String, // "pick", "squash", "reword", "drop", "fixup"
    pub sha: String,
    pub message: String,
}

#[derive(Serialize)]
struct MessageEntry<'a> {
    sha: &'a str,
    message: &'a str,
    consumed: bool,
}

fn helper_bin_name() -> &'static str {
    #[cfg(windows)]
    {
        "rebase_helper.exe"
    }
    #[cfg(not(windows))]
    {
        "rebase_helper"
    }
}

pub fn normalize_path_for_git(path: &Path) -> String {
    let s = path.to_string_lossy();
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    stripped.replace('\\', "/")
}

pub fn find_rebase_helper() -> Result<PathBuf, String> {
    if let Ok(path_str) = std::env::var("GITSHOW_REBASE_HELPER_PATH") {
        let p = PathBuf::from(path_str);
        if p.exists() {
            return Ok(p);
        }
    }

    let bin_name = helper_bin_name();

    if let Ok(curr) = std::env::current_exe() {
        if let Some(parent) = curr.parent() {
            let candidate = parent.join(bin_name);
            if candidate.exists() {
                return Ok(candidate);
            }
            if let Some(grandparent) = parent.parent() {
                let candidate = grandparent.join(bin_name);
                if candidate.exists() {
                    return Ok(candidate);
                }
                let candidate = grandparent.join("debug").join(bin_name);
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    let cwd_candidates = [
        PathBuf::from("target").join("debug").join(bin_name),
        PathBuf::from("target").join("release").join(bin_name),
        PathBuf::from("src-tauri").join("target").join("debug").join(bin_name),
        PathBuf::from("src-tauri").join("target").join("release").join(bin_name),
    ];
    for cand in &cwd_candidates {
        if cand.exists() {
            if let Ok(abs) = std::fs::canonicalize(cand) {
                let s = abs.to_string_lossy();
                let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
                return Ok(PathBuf::from(stripped));
            }
            return Ok(cand.clone());
        }
    }

    if let Ok(cargo) = std::env::var("CARGO") {
        let mut cmd = std::process::Command::new(cargo);
        cmd.args(["build", "--bin", "rebase_helper"]);
        if Path::new("src-tauri/Cargo.toml").exists() {
            cmd.arg("--manifest-path").arg("src-tauri/Cargo.toml");
        }
        if let Ok(status) = cmd.status() {
            if status.success() {
                for cand in &cwd_candidates {
                    if cand.exists() {
                        if let Ok(abs) = std::fs::canonicalize(cand) {
                            let s = abs.to_string_lossy();
                            let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
                            return Ok(PathBuf::from(stripped));
                        }
                        return Ok(cand.clone());
                    }
                }
            }
        }
    }

    Err(format!("Could not locate '{}' binary", bin_name))
}

pub async fn execute_interactive_rebase(
    repo: &str,
    base_sha: &str,
    items: Vec<RebaseItem>,
) -> Result<(), String> {
    let lock_manager = RepoLockManager::new();
    execute_interactive_rebase_with_lock(&lock_manager, repo, base_sha, items).await
}

pub async fn execute_interactive_rebase_with_lock(
    lock_manager: &RepoLockManager,
    repo: &str,
    base_sha: &str,
    items: Vec<RebaseItem>,
) -> Result<(), String> {
    lock_manager
        .with_mutation_lock(repo, || execute_interactive_rebase_inner(repo, base_sha, items))
        .await
}

async fn execute_interactive_rebase_inner(
    repo: &str,
    base_sha: &str,
    items: Vec<RebaseItem>,
) -> Result<(), String> {
    if items.is_empty() {
        return Err("Rebase items cannot be empty".to_string());
    }

    let helper_path = find_rebase_helper()?;

    // 1. Format the rebase-todo content
    let mut todo_content = String::new();
    for item in &items {
        let action = item.action.trim();
        let sha = item.sha.trim();
        let first_line = item.message.lines().next().unwrap_or("").trim();
        if first_line.is_empty() {
            todo_content.push_str(&format!("{action} {sha}\n"));
        } else {
            todo_content.push_str(&format!("{action} {sha} {first_line}\n"));
        }
    }

    // Write custom todo to temp file
    let todo_temp = TempFileGuard::new("gitshow-rebase-todo-", ".txt");
    fs::write(todo_temp.path(), todo_content)
        .map_err(|e| format!("Failed to write temp todo file: {e}"))?;

    // 2. Prepare custom commit messages for reword / squash
    let mut messages = Vec::new();
    for item in &items {
        if item.action == "reword" || (item.action == "squash" && !item.message.trim().is_empty()) {
            messages.push(MessageEntry {
                sha: &item.sha,
                message: &item.message,
                consumed: false,
            });
        }
    }

    let messages_temp = if !messages.is_empty() {
        let temp = TempFileGuard::new("gitshow-rebase-msgs-", ".json");
        let json = serde_json::to_string_pretty(&messages)
            .map_err(|e| format!("Failed to serialize rebase messages: {e}"))?;
        fs::write(temp.path(), json)
            .map_err(|e| format!("Failed to write rebase messages file: {e}"))?;
        Some(temp)
    } else {
        None
    };

    let helper_str = normalize_path_for_git(&helper_path);
    let todo_str = normalize_path_for_git(todo_temp.path());
    let seq_editor_cmd = format!("\"{}\" \"{}\"", helper_str, todo_str);

    let (editor_cmd, msg_clean_path) = match messages_temp {
        Some(ref mt) => {
            let p_str = normalize_path_for_git(mt.path());
            (format!("\"{}\" --editor \"{}\"", helper_str, p_str), Some(p_str))
        }
        None => (format!("\"{}\" --editor", helper_str), None),
    };

    let mut cmd = tokio::process::Command::new("git");
    cmd.args(["rebase", "-i", base_sha])
        .current_dir(repo)
        .env("GIT_SEQUENCE_EDITOR", &seq_editor_cmd)
        .env("GIT_EDITOR", &editor_cmd)
        .env("EDITOR", &editor_cmd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GITSHOW_REBASE_TODO_FILE", &todo_str);

    if let Some(ref mp) = msg_clean_path {
        cmd.env("GITSHOW_REBASE_MESSAGES_FILE", mp);
    }

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to spawn git rebase: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.trim().is_empty() {
            stdout
        } else if stdout.trim().is_empty() {
            stderr
        } else {
            format!("{stderr}\n{stdout}")
        };
        Err(format!("Rebase failed: {combined}"))
    }
}
