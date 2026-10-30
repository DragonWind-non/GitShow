use gitshow_lib::engine::repo::{list_branches, list_tags, open_repository};
use tempfile::tempdir;

fn setup_test_repo() -> (tempfile::TempDir, git2::Oid, String) {
    let dir = tempdir().expect("failed to create temp dir");
    let repo = git2::Repository::init(dir.path()).expect("failed to init repo");

    let file_path = dir.path().join("README.md");
    std::fs::write(&file_path, "# GitShow Test").expect("failed to write test file");

    let mut index = repo.index().expect("failed to get index");
    index
        .add_path(std::path::Path::new("README.md"))
        .expect("failed to add file to index");
    index.write().expect("failed to write index");
    let tree_id = index.write_tree().expect("failed to write tree");
    let tree = repo.find_tree(tree_id).expect("failed to find tree");

    let sig = git2::Signature::now("GitShow Tester", "tester@gitshow.dev")
        .expect("failed to create signature");

    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
        .expect("failed to create initial commit");

    let commit = repo.find_commit(commit_id).expect("failed to find commit");
    repo.branch("feature/test", &commit, false)
        .expect("failed to create feature/test branch");

    let head = repo.head().expect("failed to get head");
    let default_branch = head.shorthand().expect("shorthand").to_string();

    (dir, commit_id, default_branch)
}

#[test]
fn test_open_repository_valid() {
    let (dir, _commit_id, default_branch) = setup_test_repo();
    let path_str = dir.path().to_str().expect("valid utf-8 path");

    let info = open_repository(path_str).expect("open_repository should succeed");

    assert_eq!(info.current_branch, Some(default_branch));
    assert!(!info.is_detached);
    assert!(info.is_clean);
    assert!(
        info.path.contains(dir.path().file_name().unwrap().to_str().unwrap()),
        "info.path ({}) should contain temp directory name",
        info.path
    );
}

#[test]
fn test_open_repository_dirty() {
    let (dir, _commit_id, _default_branch) = setup_test_repo();
    let path_str = dir.path().to_str().expect("valid utf-8 path");

    let dirty_file = dir.path().join("untracked.txt");
    std::fs::write(dirty_file, "new dirty content").expect("failed to write dirty file");

    let info = open_repository(path_str).expect("open_repository should succeed");
    assert!(!info.is_clean, "repository with untracked file must not be clean");
}

#[test]
fn test_open_repository_detached_head() {
    let (dir, commit_id, _default_branch) = setup_test_repo();
    let path_str = dir.path().to_str().expect("valid utf-8 path");

    let repo = git2::Repository::open(dir.path()).expect("open repo");
    repo.set_head_detached(commit_id).expect("detach HEAD");

    let info = open_repository(path_str).expect("open_repository should succeed");
    assert!(info.is_detached, "detached repo must have is_detached = true");
    assert_eq!(
        info.current_branch, None,
        "detached repo must have current_branch = None"
    );
}

#[test]
fn test_open_repository_invalid_path() {
    let non_existent = "D:/this/path/definitely/does/not/exist_123456";
    let res = open_repository(non_existent);
    assert!(res.is_err(), "opening non-existent path should return Err");
}

#[test]
fn test_list_branches() {
    let (dir, commit_id, default_branch) = setup_test_repo();
    let path_str = dir.path().to_str().expect("valid utf-8 path");

    let branches = list_branches(path_str).expect("list_branches should succeed");

    let current = branches
        .iter()
        .find(|b| b.name == default_branch)
        .expect("default branch should exist");
    assert!(current.is_current);
    assert!(!current.is_remote);
    assert_eq!(current.target_commit, commit_id.to_string());

    let feature = branches
        .iter()
        .find(|b| b.name == "feature/test")
        .expect("feature/test should exist");
    assert!(!feature.is_current);
    assert!(!feature.is_remote);
    assert_eq!(feature.target_commit, commit_id.to_string());
}

#[test]
fn test_list_tags() {
    let (dir, commit_id, _default_branch) = setup_test_repo();
    let path_str = dir.path().to_str().expect("valid utf-8 path");

    let repo = git2::Repository::open(dir.path()).expect("open repo");
    let commit = repo.find_commit(commit_id).expect("find commit");
    let sig = git2::Signature::now("GitShow Tester", "tester@gitshow.dev").expect("signature");

    repo.tag(
        "v1.0.0",
        commit.as_object(),
        &sig,
        "Release version 1.0.0",
        false,
    )
    .expect("create annotated tag");
    repo.tag_lightweight("v0.1.0-lightweight", commit.as_object(), false)
        .expect("create lightweight tag");

    let tags = list_tags(path_str).expect("list_tags should succeed");
    assert_eq!(tags.len(), 2);

    let v1 = tags.iter().find(|t| t.name == "v1.0.0").expect("v1.0.0 tag");
    assert_eq!(v1.target_commit, commit_id.to_string());
    assert_eq!(v1.message.as_deref(), Some("Release version 1.0.0"));

    let v0 = tags
        .iter()
        .find(|t| t.name == "v0.1.0-lightweight")
        .expect("lightweight tag");
    assert_eq!(v0.target_commit, commit_id.to_string());
    assert_eq!(v0.message, None);
}
