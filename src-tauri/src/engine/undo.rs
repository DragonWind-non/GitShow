use crate::commands::git_cli::{execute_git_command, execute_git_command_with_lock};
use crate::engine::lock::{normalize_repo_path, RepoLockManager};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UndoSnapshot {
    pub id: String,
    pub timestamp: i64,
    pub action_name: String,
    pub pre_head_sha: String,
    pub dangling_stash_sha: Option<String>,
    pub restore_cli_command: String,
}

static SNAPSHOT_STORE: OnceLock<Mutex<HashMap<PathBuf, Vec<UndoSnapshot>>>> = OnceLock::new();
static LOCK_MANAGER: OnceLock<RepoLockManager> = OnceLock::new();
static COUNTER: AtomicU64 = AtomicU64::new(1);

fn get_lock_manager() -> &'static RepoLockManager {
    LOCK_MANAGER.get_or_init(RepoLockManager::new)
}

fn get_store() -> &'static Mutex<HashMap<PathBuf, Vec<UndoSnapshot>>> {
    SNAPSHOT_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get_appdata_undo_file() -> Option<PathBuf> {
    if let Ok(file_path) = std::env::var("GITSHOW_UNDO_FILE") {
        if !file_path.trim().is_empty() {
            return Some(PathBuf::from(file_path));
        }
    }
    if let Ok(dir_path) = std::env::var("GITSHOW_DATA_DIR") {
        if !dir_path.trim().is_empty() {
            return Some(PathBuf::from(dir_path).join("undo.json"));
        }
    }

    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Some(PathBuf::from(appdata).join("gitshow").join("undo.json"));
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return Some(
                PathBuf::from(profile)
                    .join("AppData")
                    .join("Roaming")
                    .join("gitshow")
                    .join("undo.json"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Some(
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("gitshow")
                    .join("undo.json"),
            );
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            return Some(PathBuf::from(xdg).join("gitshow").join("undo.json"));
        }
        if let Ok(home) = std::env::var("HOME") {
            return Some(
                PathBuf::from(home)
                    .join(".local")
                    .join("share")
                    .join("gitshow")
                    .join("undo.json"),
            );
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".gitshow").join("undo.json"));
    }

    None
}

fn save_snapshots_to_disk(repo_path: &Path, snapshots: &[UndoSnapshot]) {
    if let Some(appdata_file) = get_appdata_undo_file() {
        if let Some(parent) = appdata_file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let key = normalize_repo_path(repo_path).to_string_lossy().to_string();
        let mut map: HashMap<String, Vec<UndoSnapshot>> =
            if let Ok(data) = fs::read_to_string(&appdata_file) {
                serde_json::from_str(&data).unwrap_or_default()
            } else {
                HashMap::new()
            };
        map.insert(key, snapshots.to_vec());
        if let Ok(json) = serde_json::to_string_pretty(&map) {
            let tmp_file = appdata_file.with_file_name(format!(
                "undo.json.tmp.{}.{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            if fs::write(&tmp_file, json).is_ok() {
                if fs::rename(&tmp_file, &appdata_file).is_err() {
                    let _ = fs::remove_file(&appdata_file);
                    let _ = fs::rename(&tmp_file, &appdata_file);
                }
            }
        }
    }
}

fn load_snapshots_from_disk(repo_path: &Path) -> Vec<UndoSnapshot> {
    if let Some(appdata_file) = get_appdata_undo_file() {
        if let Ok(data) = fs::read_to_string(appdata_file) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, Vec<UndoSnapshot>>>(&data) {
                let key = normalize_repo_path(repo_path).to_string_lossy().to_string();
                if let Some(snaps) = map.get(&key) {
                    return snaps.clone();
                }
            }
        }
    }

    Vec::new()
}

pub async fn capture_pre_mutation_snapshot(
    repo_path: &str,
    action: &str,
) -> Result<UndoSnapshot, String> {
    let repo_path_buf = Path::new(repo_path);
    let lock_mgr = get_lock_manager();

    let head_res = execute_git_command(repo_path, &["rev-parse", "HEAD"]).await?;
    if head_res.exit_code != 0 {
        return Err(format!(
            "Failed to resolve HEAD commit: {}",
            head_res.stderr.trim()
        ));
    }
    let pre_head_sha = head_res.stdout.trim().to_string();
    if pre_head_sha.is_empty() {
        return Err("Resolved empty HEAD SHA".to_string());
    }

    let stash_res =
        execute_git_command_with_lock(lock_mgr, repo_path, &["stash", "create"]).await?;
    if stash_res.exit_code != 0 {
        return Err(format!(
            "Failed to create dangling stash: {}",
            stash_res.stderr.trim()
        ));
    }

    let stash_out = stash_res.stdout.trim();
    let dangling_stash_sha = if stash_out.is_empty() {
        None
    } else {
        Some(stash_out.to_string())
    };

    let restore_cli_command = match &dangling_stash_sha {
        Some(sha) => format!("git reset --hard {pre_head_sha} && git stash apply {sha}"),
        None => format!("git reset --hard {pre_head_sha}"),
    };

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let timestamp = now.as_secs() as i64;
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let id = format!("snap-{}-{}", now.as_millis(), seq);

    let snapshot = UndoSnapshot {
        id,
        timestamp,
        action_name: action.to_string(),
        pre_head_sha,
        dangling_stash_sha,
        restore_cli_command,
    };

    let norm_path = normalize_repo_path(repo_path_buf);
    let snapshots_to_save = {
        let mut store = get_store().lock().map_err(|e| e.to_string())?;
        let entry = store
            .entry(norm_path)
            .or_insert_with(|| load_snapshots_from_disk(repo_path_buf));
        entry.push(snapshot.clone());
        entry.clone()
    };

    save_snapshots_to_disk(repo_path_buf, &snapshots_to_save);

    Ok(snapshot)
}

pub async fn rollback_snapshot(repo_path: &str, snapshot_id: &str) -> Result<String, String> {
    let repo_path_buf = Path::new(repo_path);
    let norm_path = normalize_repo_path(repo_path_buf);

    let snapshot = {
        let mut store = get_store().lock().map_err(|e| e.to_string())?;
        let entry = store
            .entry(norm_path)
            .or_insert_with(|| load_snapshots_from_disk(repo_path_buf));
        if let Some(snap) = entry.iter().find(|s| s.id == snapshot_id) {
            snap.clone()
        } else {
            *entry = load_snapshots_from_disk(repo_path_buf);
            entry
                .iter()
                .find(|s| s.id == snapshot_id)
                .cloned()
                .ok_or_else(|| format!("Snapshot not found: '{snapshot_id}'"))?
        }
    };

    let lock_mgr = get_lock_manager();

    let reset_res = execute_git_command_with_lock(
        lock_mgr,
        repo_path,
        &["reset", "--hard", &snapshot.pre_head_sha],
    )
    .await?;

    if reset_res.exit_code != 0 {
        return Err(format!(
            "Rollback reset failed: {}",
            reset_res.stderr.trim()
        ));
    }

    if let Some(ref stash_sha) = snapshot.dangling_stash_sha {
        let apply_res =
            execute_git_command_with_lock(lock_mgr, repo_path, &["stash", "apply", stash_sha])
                .await?;

        if apply_res.exit_code != 0 {
            let err_msg = if !apply_res.stderr.trim().is_empty() {
                apply_res.stderr.trim().to_string()
            } else if !apply_res.stdout.trim().is_empty() {
                apply_res.stdout.trim().to_string()
            } else {
                "Unknown error applying stash".to_string()
            };
            return Err(format!("Rollback stash apply failed: {}", err_msg));
        }
    }

    Ok(format!(
        "Successfully rolled back snapshot {} (HEAD: {})",
        snapshot.id, snapshot.pre_head_sha
    ))
}

pub fn get_undo_stack(repo_path: &str) -> Vec<UndoSnapshot> {
    let repo_path_buf = Path::new(repo_path);
    let norm_path = normalize_repo_path(repo_path_buf);

    let mut stack = {
        if let Ok(mut store) = get_store().lock() {
            let entry = store
                .entry(norm_path)
                .or_insert_with(|| load_snapshots_from_disk(repo_path_buf));
            entry.clone()
        } else {
            load_snapshots_from_disk(repo_path_buf)
        }
    };

    stack.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then_with(|| b.id.cmp(&a.id)));
    stack
}
