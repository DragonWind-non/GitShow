use gitshow_lib::commands::git_cli::{
    execute_git_command, execute_git_command_with_lock, preview_command,
};
use gitshow_lib::engine::lock::RepoLockManager;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tempfile::tempdir;

fn setup_test_repo() -> (tempfile::TempDir, String) {
    let dir = tempdir().expect("failed to create temp dir");
    let repo = git2::Repository::init(dir.path()).expect("failed to init repo");

    let mut config = repo.config().expect("failed to get config");
    config
        .set_str("user.name", "GitShow Tester")
        .expect("failed to set user.name");
    config
        .set_str("user.email", "tester@gitshow.dev")
        .expect("failed to set user.email");

    let path_str = dir.path().to_str().expect("valid utf-8 path").to_string();
    (dir, path_str)
}

#[test]
fn test_preview_command_simple() {
    let preview = preview_command(&["status", "--short"]);
    assert_eq!(preview, "git status --short");
}

#[test]
fn test_preview_command_with_spaces() {
    let preview = preview_command(&["commit", "-m", "hello world"]);
    assert_eq!(preview, "git commit -m \"hello world\"");
}

#[tokio::test]
async fn test_execute_git_command_status() {
    let (_dir, repo_path) = setup_test_repo();

    let result = execute_git_command(&repo_path, &["status", "--short"])
        .await
        .expect("execute_git_command should succeed");

    assert_eq!(result.exit_code, 0);
    assert_eq!(result.preview_command, "git status --short");
}

#[tokio::test]
async fn test_execute_git_command_commit_captures_output() {
    let (dir, repo_path) = setup_test_repo();

    let file_path = dir.path().join("file.txt");
    std::fs::write(&file_path, "hello gitshow").expect("write file");

    let add_result = execute_git_command(&repo_path, &["add", "file.txt"])
        .await
        .expect("git add should succeed");
    assert_eq!(add_result.exit_code, 0);

    let commit_result = execute_git_command(&repo_path, &["commit", "-m", "initial commit"])
        .await
        .expect("git commit should succeed");

    assert_eq!(commit_result.exit_code, 0);
    assert_eq!(
        commit_result.preview_command,
        "git commit -m \"initial commit\""
    );
    assert!(
        commit_result.stdout.contains("initial commit")
            || commit_result.stdout.contains("file changed")
            || commit_result.stdout.contains("1 file changed"),
        "commit stdout should contain commit details: {}",
        commit_result.stdout
    );
}

#[tokio::test]
async fn test_execute_git_command_with_lock_manager() {
    let (dir, repo_path) = setup_test_repo();
    let file_path = dir.path().join("dummy.txt");
    std::fs::write(&file_path, "dummy content").expect("write file");

    let lock_manager = RepoLockManager::new();

    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let lock_manager_clone = lock_manager.clone();
    let path_clone = repo_path.clone();
    let background_ran = Arc::new(AtomicBool::new(false));
    let background_ran_clone = background_ran.clone();

    tokio::spawn(async move {
        lock_manager_clone
            .with_mutation_lock(&path_clone, || async {
                background_ran_clone.store(true, Ordering::SeqCst);
                let _ = entered_tx.send(());
                let _ = release_rx.await;
                Ok::<_, String>(())
            })
            .await
    });

    entered_rx.await.expect("wait for background lock entry");

    assert!(
        lock_manager.is_locked(&repo_path),
        "repo must be locked while background holds lock"
    );

    // Spawn execute_git_command_with_lock, which should wait for release
    let lock_manager_exec = lock_manager.clone();
    let path_exec = repo_path.clone();
    let exec_handle = tokio::spawn(async move {
        execute_git_command_with_lock(&lock_manager_exec, &path_exec, &["status", "--short"]).await
    });

    // Short sleep to ensure exec_handle is blocked waiting for lock
    tokio::time::sleep(Duration::from_millis(40)).await;
    assert!(!exec_handle.is_finished(), "exec_handle should be waiting for lock");

    // Release the background lock
    release_tx.send(()).unwrap();

    let result = exec_handle.await.expect("task join").expect("exec git with lock");
    assert_eq!(result.exit_code, 0);
    assert_eq!(result.preview_command, "git status --short");
    assert!(background_ran.load(Ordering::SeqCst));
}

#[tokio::test]
async fn test_execute_git_command_error_handling() {
    let (_dir, repo_path) = setup_test_repo();

    // 1. Non-zero exit code: checkout a branch that does not exist
    let result = execute_git_command(&repo_path, &["checkout", "nonexistent-branch-xyz"])
        .await
        .expect("non-zero git command should return Ok(CliExecutionResult)");

    assert_ne!(result.exit_code, 0, "exit code must be non-zero");
    assert!(
        result.stderr.contains("did not match any file")
            || result.stderr.contains("error: pathspec")
            || !result.stderr.is_empty(),
        "stderr should capture git failure message: {}",
        result.stderr
    );
    assert_eq!(
        result.preview_command,
        "git checkout nonexistent-branch-xyz"
    );

    // 2. Spawn failure: invalid working directory path
    let invalid_path = "Z:/definitely/nonexistent/git/dir/123456";
    let spawn_err = execute_git_command(invalid_path, &["status"]).await;
    assert!(
        spawn_err.is_err(),
        "spawning in non-existent directory should return Err"
    );
}
