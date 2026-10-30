use gitshow_lib::ipc;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static IPC_REPO_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TempRepo {
    path: PathBuf,
}

impl TempRepo {
    fn new() -> Self {
        let counter = IPC_REPO_COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("gitshow_ipc_test_{}_{}", std::process::id(), counter));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("failed to create temp dir");

        let repo = Self { path };
        repo.git(&["init", "-b", "main"]);
        repo.git(&["config", "user.name", "IPC Tester"]);
        repo.git(&["config", "user.email", "ipc@gitshow.dev"]);

        let file = repo.path.join("README.md");
        fs::write(&file, "# IPC Test Repo\n").unwrap();
        repo.git(&["add", "README.md"]);
        repo.git(&["commit", "-m", "Initial commit"]);

        repo
    }

    fn path_str(&self) -> String {
        self.path.to_string_lossy().to_string()
    }

    fn git(&self, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(&self.path)
            .output()
            .unwrap_or_else(|e| panic!("failed to execute git {:?}: {}", args, e));
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[tokio::test]
async fn test_ipc_repository_workflow() {
    let repo = TempRepo::new();
    let path = repo.path_str();

    // 1. open_repository
    let info = ipc::open_repository(path.clone()).expect("open_repository failed");
    assert_eq!(info.current_branch.as_deref(), Some("main"));
    assert!(info.is_clean);

    // 2. list_branches
    let branches = ipc::list_branches(path.clone()).expect("list_branches failed");
    assert!(!branches.is_empty());
    assert!(branches.iter().any(|b| b.name == "main" && b.is_current));

    // 3. list_tags
    repo.git(&["tag", "-a", "v1.0.0", "-m", "Release v1.0.0"]);
    let tags = ipc::list_tags(path.clone()).expect("list_tags failed");
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].name, "v1.0.0");

    // 4. execute_git_command & preview_command
    let preview = ipc::preview_command(vec!["commit".into(), "-m".into(), "hello world".into()]);
    assert_eq!(preview, "git commit -m \"hello world\"");

    let cmd_res = ipc::execute_git_command(
        path.clone(),
        vec!["checkout".into(), "-b".into(), "feature/ipc".into()],
    )
    .await
    .expect("execute_git_command failed");
    assert_eq!(cmd_res.exit_code, 0);

    let info_feature = ipc::open_repository(path.clone()).unwrap();
    assert_eq!(info_feature.current_branch.as_deref(), Some("feature/ipc"));

    // 5. build_commit_graph
    let commits = ipc::build_commit_graph(path.clone(), Some(50)).expect("build_commit_graph failed");
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].summary, "Initial commit");

    // 6. capture_pre_mutation_snapshot & rollback_snapshot
    let snap = ipc::capture_pre_mutation_snapshot(path.clone(), "git reset --hard".into())
        .await
        .expect("capture snapshot failed");
    assert!(!snap.id.is_empty());
    assert!(!snap.pre_head_sha.is_empty());

    let stack = ipc::get_undo_stack(path.clone());
    assert!(!stack.is_empty());
    assert!(stack.iter().any(|s| s.id == snap.id));

    let rollback_res = ipc::rollback_snapshot(path.clone(), snap.id.clone())
        .await
        .expect("rollback failed");
    assert!(rollback_res.contains(&snap.id));
}

#[test]
fn test_ipc_token_storage() {
    std::env::set_var("GITSHOW_MOCK_KEYRING", "1");

    let initial = ipc::get_token().expect("get_token failed");
    assert_eq!(initial, None);

    ipc::store_token("ghp_test_token_12345".into()).expect("store_token failed");
    let stored = ipc::get_token().expect("get_token after store failed");
    assert_eq!(stored, Some("ghp_test_token_12345".to_string()));

    ipc::remove_token().expect("remove_token failed");
    let after_remove = ipc::get_token().expect("get_token after remove failed");
    assert_eq!(after_remove, None);
}

#[test]
fn test_ipc_pty_session() {
    let repo = TempRepo::new();
    let path = repo.path_str();

    let session_id = ipc::create_pty_session(path, 80, 24).expect("create_pty_session failed");
    assert!(session_id > 0);

    ipc::resize_pty(session_id, 100, 30).expect("resize_pty failed");
    let _ = ipc::write_to_pty(session_id, b"echo test\r\n".to_vec());
    let _ = ipc::read_from_pty(session_id);
    ipc::close_pty_session(session_id).expect("close_pty_session failed");
}
