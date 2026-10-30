use gitshow_lib::commands::git_cli::execute_git_command;
use gitshow_lib::engine::undo::{
    capture_pre_mutation_snapshot, get_appdata_undo_file, get_undo_stack, rollback_snapshot,
};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;
use tempfile::tempdir;

static TEST_DATA_DIR: OnceLock<tempfile::TempDir> = OnceLock::new();

fn setup_test_repo() -> (tempfile::TempDir, String) {
    let test_data = TEST_DATA_DIR.get_or_init(|| tempdir().expect("test data dir"));
    std::env::set_var("GITSHOW_DATA_DIR", test_data.path());

    let dir = tempdir().expect("failed to create temp dir");
    let repo = git2::Repository::init(dir.path()).expect("failed to init repo");

    let mut config = repo.config().expect("failed to get config");
    config
        .set_str("user.name", "GitShow Tester")
        .expect("failed to set user.name");
    config
        .set_str("user.email", "tester@gitshow.dev")
        .expect("failed to set user.email");
    config
        .set_bool("core.autocrlf", false)
        .expect("failed to set autocrlf");

    let path_str = dir.path().to_str().expect("valid utf-8 path").to_string();
    (dir, path_str)
}

async fn make_commit(repo_path: &str, filename: &str, content: &str, message: &str) -> String {
    let file_path = Path::new(repo_path).join(filename);
    fs::write(&file_path, content).expect("write file");

    let add_res = execute_git_command(repo_path, &["add", filename])
        .await
        .expect("git add");
    assert_eq!(add_res.exit_code, 0, "git add failed: {}", add_res.stderr);

    let commit_res = execute_git_command(repo_path, &["commit", "-m", message])
        .await
        .expect("git commit");
    assert_eq!(
        commit_res.exit_code, 0,
        "git commit failed: {}",
        commit_res.stderr
    );

    let rev_res = execute_git_command(repo_path, &["rev-parse", "HEAD"])
        .await
        .expect("git rev-parse HEAD");
    assert_eq!(
        rev_res.exit_code, 0,
        "git rev-parse failed: {}",
        rev_res.stderr
    );
    rev_res.stdout.trim().to_string()
}

#[tokio::test]
async fn test_safe_undo_with_uncommitted_changes() {
    let (_dir, repo_path) = setup_test_repo();

    let c0_sha = make_commit(&repo_path, "tracked.txt", "line 1\n", "Initial commit C0").await;
    let c1_sha = make_commit(
        &repo_path,
        "tracked.txt",
        "line 1\nline 2\n",
        "Second commit C1",
    )
    .await;
    assert_ne!(c0_sha, c1_sha);

    // Make uncommitted edits in tracked file
    let tracked_path = Path::new(&repo_path).join("tracked.txt");
    fs::write(&tracked_path, "line 1\nline 2\nline 3 uncommitted\n").expect("edit tracked file");

    // Create a new untracked file and stage it
    let untracked_path = Path::new(&repo_path).join("new_file.txt");
    fs::write(&untracked_path, "new file content\n").expect("create new file");
    let add_res = execute_git_command(&repo_path, &["add", "new_file.txt"])
        .await
        .expect("git add new_file.txt");
    assert_eq!(add_res.exit_code, 0);

    // Capture snapshot before destructive action
    let snapshot = capture_pre_mutation_snapshot(&repo_path, "reset --hard HEAD~1")
        .await
        .expect("capture snapshot");

    assert_eq!(snapshot.pre_head_sha, c1_sha);
    assert_eq!(snapshot.action_name, "reset --hard HEAD~1");
    assert!(
        snapshot.dangling_stash_sha.is_some(),
        "dangling_stash_sha must be Some when uncommitted changes exist"
    );
    let stash_sha = snapshot.dangling_stash_sha.as_ref().unwrap();
    assert_eq!(stash_sha.len(), 40);
    assert_eq!(
        snapshot.restore_cli_command,
        format!("git reset --hard {c1_sha} && git stash apply {stash_sha}")
    );

    // Execute destructive command: git reset --hard HEAD~1
    let reset_res = execute_git_command(&repo_path, &["reset", "--hard", "HEAD~1"])
        .await
        .expect("destructive reset");
    assert_eq!(reset_res.exit_code, 0);

    // Verify HEAD is now at C0 and uncommitted changes are gone
    let cur_head = execute_git_command(&repo_path, &["rev-parse", "HEAD"])
        .await
        .expect("rev-parse");
    assert_eq!(cur_head.stdout.trim(), c0_sha);

    let tracked_content = fs::read_to_string(&tracked_path).expect("read tracked.txt");
    assert_eq!(tracked_content.replace("\r\n", "\n"), "line 1\n");
    assert!(
        !untracked_path.exists(),
        "new_file.txt must be gone after reset --hard"
    );

    // Execute rollback
    let rollback_msg = rollback_snapshot(&repo_path, &snapshot.id)
        .await
        .expect("rollback snapshot");
    assert!(
        rollback_msg.contains(&snapshot.id) || rollback_msg.contains(&c1_sha),
        "rollback response should mention snapshot or sha: {rollback_msg}"
    );

    // Assert HEAD is restored back to C1
    let restored_head = execute_git_command(&repo_path, &["rev-parse", "HEAD"])
        .await
        .expect("rev-parse");
    assert_eq!(restored_head.stdout.trim(), c1_sha);

    // Assert uncommitted changes are restored
    let restored_tracked = fs::read_to_string(&tracked_path).expect("read tracked.txt");
    assert_eq!(
        restored_tracked.replace("\r\n", "\n"),
        "line 1\nline 2\nline 3 uncommitted\n"
    );

    assert!(
        untracked_path.exists(),
        "new_file.txt must be restored by rollback"
    );
    let restored_untracked = fs::read_to_string(&untracked_path).expect("read new_file.txt");
    assert_eq!(
        restored_untracked.replace("\r\n", "\n"),
        "new file content\n"
    );
}

#[tokio::test]
async fn test_safe_undo_clean_working_copy() {
    let (_dir, repo_path) = setup_test_repo();

    let c0_sha = make_commit(&repo_path, "base.txt", "v0\n", "C0").await;
    let c1_sha = make_commit(&repo_path, "base.txt", "v1\n", "C1").await;

    // Snapshot when working tree is completely clean
    let snapshot = capture_pre_mutation_snapshot(&repo_path, "reset --hard HEAD~1")
        .await
        .expect("capture snapshot");

    assert_eq!(snapshot.pre_head_sha, c1_sha);
    assert_eq!(snapshot.dangling_stash_sha, None);
    assert_eq!(
        snapshot.restore_cli_command,
        format!("git reset --hard {c1_sha}")
    );

    // Destructive reset
    let reset_res = execute_git_command(&repo_path, &["reset", "--hard", "HEAD~1"])
        .await
        .expect("reset");
    assert_eq!(reset_res.exit_code, 0);

    let cur_head = execute_git_command(&repo_path, &["rev-parse", "HEAD"])
        .await
        .expect("rev-parse");
    assert_eq!(cur_head.stdout.trim(), c0_sha);

    // Rollback
    rollback_snapshot(&repo_path, &snapshot.id)
        .await
        .expect("rollback");

    let restored_head = execute_git_command(&repo_path, &["rev-parse", "HEAD"])
        .await
        .expect("rev-parse");
    assert_eq!(restored_head.stdout.trim(), c1_sha);
}

#[tokio::test]
async fn test_get_undo_stack_sorted_desc() {
    let (_dir, repo_path) = setup_test_repo();
    make_commit(&repo_path, "a.txt", "hello", "initial").await;

    let s1 = capture_pre_mutation_snapshot(&repo_path, "action 1")
        .await
        .expect("snap 1");

    // Sleep briefly to ensure distinct or monotonic timestamp
    tokio::time::sleep(std::time::Duration::from_millis(15)).await;

    let s2 = capture_pre_mutation_snapshot(&repo_path, "action 2")
        .await
        .expect("snap 2");

    let stack = get_undo_stack(&repo_path);
    assert_eq!(stack.len(), 2);
    assert_eq!(stack[0].id, s2.id);
    assert_eq!(stack[1].id, s1.id);
    assert_eq!(stack[0].action_name, "action 2");
    assert_eq!(stack[1].action_name, "action 1");
    assert!(stack[0].timestamp >= stack[1].timestamp);
}

#[tokio::test]
async fn test_rollback_nonexistent_snapshot_fails() {
    let (_dir, repo_path) = setup_test_repo();
    make_commit(&repo_path, "a.txt", "hello", "initial").await;

    let res = rollback_snapshot(&repo_path, "nonexistent-id-9999").await;
    assert!(res.is_err(), "rollback of unknown snapshot must fail");
    let err_msg = res.unwrap_err();
    assert!(err_msg.contains("nonexistent-id-9999") || err_msg.contains("not found"));
}

#[tokio::test]
async fn test_undo_persistence_on_disk() {
    let (_dir, repo_path) = setup_test_repo();
    make_commit(&repo_path, "file.txt", "disk test", "init").await;

    let snap = capture_pre_mutation_snapshot(&repo_path, "test-action")
        .await
        .expect("capture");

    // 1. Verify zero proprietary files in .git
    let git_undo_path = Path::new(&repo_path).join(".git").join("gitshow_undo.json");
    assert!(
        !git_undo_path.exists(),
        "Never write proprietary files inside .git directory"
    );

    // 2. Verify persistence in app data undo.json
    let undo_json_path = get_appdata_undo_file().expect("app data undo file path");
    assert!(
        undo_json_path.exists(),
        "undo.json must exist in application data directory"
    );

    let content = fs::read_to_string(&undo_json_path).expect("read undo json");
    assert!(content.contains(&snap.id));
    assert!(content.contains(&snap.pre_head_sha));
}

#[tokio::test]
async fn test_capture_empty_repo_fails() {
    let (_dir, repo_path) = setup_test_repo();
    // Repo has no commits yet
    let res = capture_pre_mutation_snapshot(&repo_path, "action on empty repo").await;
    assert!(res.is_err(), "snapshot on repo with no commits must fail");
}
