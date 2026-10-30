use gitshow_lib::commands::git_cli::execute_git_command;
use gitshow_lib::commands::rebase::{execute_interactive_rebase, RebaseItem};
use std::fs;
use std::path::Path;
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
async fn test_reorder_and_squash_commits() {
    let (dir, repo_path) = setup_test_repo();

    let c0_sha = make_commit(&repo_path, "c0.txt", "base", "chore: initial commit").await;
    let c1_sha = make_commit(&repo_path, "file1.txt", "file 1 content", "feat: commit 1").await;
    let c2_sha = make_commit(&repo_path, "file2.txt", "file 2 content", "feat: commit 2").await;
    let c3_sha = make_commit(&repo_path, "file3.txt", "file 3 content", "feat: commit 3").await;

    // Reorder: C2 first, then C1, then squash C3 into C1
    let items = vec![
        RebaseItem {
            action: "pick".to_string(),
            sha: c2_sha.clone(),
            message: "feat: commit 2".to_string(),
        },
        RebaseItem {
            action: "pick".to_string(),
            sha: c1_sha.clone(),
            message: "feat: commit 1".to_string(),
        },
        RebaseItem {
            action: "squash".to_string(),
            sha: c3_sha.clone(),
            message: "feat: commit 3".to_string(),
        },
    ];

    let result = execute_interactive_rebase(&repo_path, &c0_sha, items).await;
    assert!(result.is_ok(), "rebase should succeed: {:?}", result.err());

    // Verify commit count on top of c0: should be 2 commits (C2, and squashed C1+C3)
    let log_res = execute_git_command(&repo_path, &["rev-list", "--count", &format!("{c0_sha}..HEAD")])
        .await
        .expect("rev-list count");
    assert_eq!(log_res.stdout.trim(), "2", "expected 2 commits after squash");

    // Verify files exist in working tree
    assert!(dir.path().join("file1.txt").exists(), "file1 should exist");
    assert!(dir.path().join("file2.txt").exists(), "file2 should exist");
    assert!(dir.path().join("file3.txt").exists(), "file3 should exist");

    // Verify HEAD~1 only has file2.txt and c0.txt (C2 was moved before C1)
    let parent_files = execute_git_command(&repo_path, &["ls-tree", "--name-only", "HEAD~1"])
        .await
        .expect("ls-tree HEAD~1");
    assert!(parent_files.stdout.contains("file2.txt"));
    assert!(!parent_files.stdout.contains("file1.txt"));
    assert!(!parent_files.stdout.contains("file3.txt"));
}

#[tokio::test]
async fn test_reword_and_drop_commits() {
    let (dir, repo_path) = setup_test_repo();

    let c0_sha = make_commit(&repo_path, "c0.txt", "base", "chore: initial commit").await;
    let c1_sha = make_commit(&repo_path, "file1.txt", "file 1", "feat: commit 1").await;
    let c2_sha = make_commit(&repo_path, "file2.txt", "file 2", "feat: commit 2").await;
    let c3_sha = make_commit(&repo_path, "file3.txt", "file 3", "feat: commit 3").await;

    let items = vec![
        RebaseItem {
            action: "pick".to_string(),
            sha: c1_sha.clone(),
            message: "feat: commit 1".to_string(),
        },
        RebaseItem {
            action: "drop".to_string(),
            sha: c2_sha.clone(),
            message: "feat: commit 2".to_string(),
        },
        RebaseItem {
            action: "reword".to_string(),
            sha: c3_sha.clone(),
            message: "feat: commit 3 reworded".to_string(),
        },
    ];

    let result = execute_interactive_rebase(&repo_path, &c0_sha, items).await;
    assert!(result.is_ok(), "reword and drop should succeed: {:?}", result.err());

    // C2 was dropped: file2.txt must not exist
    assert!(!dir.path().join("file2.txt").exists(), "dropped commit file should not exist");

    // Total commits after c0 must be 2 (C1 and reworded C3)
    let count_res = execute_git_command(&repo_path, &["rev-list", "--count", &format!("{c0_sha}..HEAD")])
        .await
        .expect("rev-list count");
    assert_eq!(count_res.stdout.trim(), "2");

    // HEAD message must match the reworded message
    let msg_res = execute_git_command(&repo_path, &["log", "-1", "--format=%B", "HEAD"])
        .await
        .expect("git log message");
    assert!(
        msg_res.stdout.contains("feat: commit 3 reworded"),
        "commit message was not updated by reword: {}",
        msg_res.stdout
    );
}

#[tokio::test]
async fn test_rebase_invalid_base_sha() {
    let (_dir, repo_path) = setup_test_repo();
    let _c0 = make_commit(&repo_path, "c0.txt", "base", "c0").await;

    let items = vec![RebaseItem {
        action: "pick".to_string(),
        sha: "nonexistent".to_string(),
        message: "bad".to_string(),
    }];

    let result = execute_interactive_rebase(&repo_path, "0000000000000000000000000000000000000000", items).await;
    assert!(result.is_err(), "rebase with invalid base_sha should return Err");
}

#[tokio::test]
async fn test_rebase_conflict_returns_error() {
    let (_dir, repo_path) = setup_test_repo();

    let c0_sha = make_commit(&repo_path, "common.txt", "line 1\n", "c0").await;
    // C1 changes common.txt line 1 to AAA
    let c1_sha = make_commit(&repo_path, "common.txt", "AAA\n", "c1").await;
    // C2 changes common.txt to BBB on top of C1
    let c2_sha = make_commit(&repo_path, "common.txt", "BBB\n", "c2").await;

    // Inverting order: applying C2 directly on top of C0 (without C1) will cause conflict
    let items = vec![
        RebaseItem {
            action: "pick".to_string(),
            sha: c2_sha,
            message: "c2".to_string(),
        },
        RebaseItem {
            action: "pick".to_string(),
            sha: c1_sha,
            message: "c1".to_string(),
        },
    ];

    let result = execute_interactive_rebase(&repo_path, &c0_sha, items).await;
    assert!(result.is_err(), "conflicting rebase should fail with Err");
    let err = result.err().unwrap();
    assert!(
        err.contains("CONFLICT") || err.contains("could not apply") || err.contains("conflict") || err.contains("Failed to rebase"),
        "error should contain conflict details: {err}"
    );
}
