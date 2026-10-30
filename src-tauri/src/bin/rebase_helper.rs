use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

#[derive(Debug, Serialize, Deserialize)]
struct RebaseMessageEntry {
    sha: String,
    message: String,
    #[serde(default)]
    consumed: bool,
}

fn get_current_stopped_sha(edit_msg_path: &Path) -> Option<String> {
    let candidates = [
        edit_msg_path.parent().map(|p| p.join("rebase-merge").join("stopped-sha")),
        edit_msg_path.parent().map(|p| p.join("stopped-sha")),
        edit_msg_path.parent().map(|p| p.join("REBASE_HEAD")),
        edit_msg_path.parent().and_then(|p| p.parent()).map(|p| p.join("rebase-merge").join("stopped-sha")),
        edit_msg_path.parent().and_then(|p| p.parent()).map(|p| p.join("REBASE_HEAD")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            if let Ok(content) = fs::read_to_string(&candidate) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn handle_editor(messages_file: Option<&Path>, edit_msg_path: &Path) -> Result<(), String> {
    let messages_file = match messages_file {
        Some(p) => p.to_path_buf(),
        None => match env::var("GITSHOW_REBASE_MESSAGES_FILE") {
            Ok(val) => PathBuf::from(val),
            Err(_) => return Ok(()),
        },
    };

    if !messages_file.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&messages_file)
        .map_err(|e| format!("Failed to read messages file: {e}"))?;
    let mut entries: Vec<RebaseMessageEntry> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse messages file: {e}"))?;

    let current_sha = get_current_stopped_sha(edit_msg_path);

    let matched_idx = if let Some(ref sha) = current_sha {
        entries
            .iter()
            .position(|e| !e.consumed && (e.sha.starts_with(sha) || sha.starts_with(&e.sha)))
    } else {
        None
    };

    let idx_to_use = matched_idx.or_else(|| entries.iter().position(|e| !e.consumed));

    if let Some(idx) = idx_to_use {
        let entry = &mut entries[idx];
        entry.consumed = true;
        let new_msg = entry.message.clone();

        if let Ok(updated_json) = serde_json::to_string_pretty(&entries) {
            let _ = fs::write(&messages_file, updated_json);
        }

        fs::write(edit_msg_path, new_msg)
            .map_err(|e| format!("Failed to write commit message: {e}"))?;
    }

    Ok(())
}

fn handle_sequence_editor(source_path: Option<&Path>, target_path: &Path) -> Result<(), String> {
    let source = if let Some(p) = source_path {
        p.to_path_buf()
    } else if let Ok(val) = env::var("GITSHOW_REBASE_TODO_FILE") {
        PathBuf::from(val)
    } else if let Ok(content) = env::var("GITSHOW_REBASE_TODO") {
        fs::write(target_path, content)
            .map_err(|e| format!("Failed to write git-rebase-todo: {e}"))?;
        return Ok(());
    } else {
        return Err("No rebase todo source specified".to_string());
    };

    let content = fs::read_to_string(&source)
        .map_err(|e| format!("Failed to read source todo file '{}': {e}", source.display()))?;
    fs::write(target_path, content)
        .map_err(|e| format!("Failed to write target todo file '{}': {e}", target_path.display()))?;

    Ok(())
}

fn run(args: &[String]) -> Result<(), String> {
    if args.len() >= 3 && args[1] == "--editor" {
        let msg_file = Path::new(&args[2]);
        let target = Path::new(args.last().unwrap());
        return handle_editor(Some(msg_file), target);
    }

    if args.len() >= 2 && args[1] == "--editor" {
        let target = Path::new(args.last().unwrap());
        return handle_editor(None, target);
    }

    if args.len() >= 3 && args[1] == "--todo" {
        let src = Path::new(&args[2]);
        let target = Path::new(args.last().unwrap());
        return handle_sequence_editor(Some(src), target);
    }

    if args.len() >= 3 {
        let src = Path::new(&args[1]);
        let target = Path::new(args.last().unwrap());
        return handle_sequence_editor(Some(src), target);
    }

    let target = Path::new(&args[1]);
    let target_str = target.to_string_lossy().to_lowercase();
    if target_str.ends_with("commit_editmsg") {
        handle_editor(None, target)
    } else {
        handle_sequence_editor(None, target)
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("gitshow rebase helper");
        return;
    }

    if let Err(err) = run(&args) {
        eprintln!("rebase_helper error: {err}");
        process::exit(1);
    }
}
