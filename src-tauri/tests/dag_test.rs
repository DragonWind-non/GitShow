use gitshow_lib::engine::dag::build_commit_graph;
use tempfile::tempdir;

fn create_commit(
    repo: &git2::Repository,
    filename: &str,
    content: &str,
    message: &str,
    parents: &[&git2::Commit],
    update_ref: Option<&str>,
    timestamp_secs: i64,
) -> git2::Oid {
    let mut index = repo.index().expect("get index");
    let workdir = repo.workdir().expect("workdir");
    let file_path = workdir.join(filename);
    std::fs::write(&file_path, content).expect("write file");
    index
        .add_path(std::path::Path::new(filename))
        .expect("add path to index");
    index.write().expect("write index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");

    let time = git2::Time::new(timestamp_secs, 0);
    let sig = git2::Signature::new("GitShow Tester", "tester@gitshow.dev", &time)
        .expect("create signature");

    repo.commit(update_ref, &sig, &sig, message, &tree, parents)
        .expect("create commit")
}

#[test]
fn test_build_commit_graph_merge_topology() {
    let dir = tempdir().expect("create temp dir");
    let repo = git2::Repository::init(dir.path()).expect("init repo");

    // 1. Create root commit C0 on main
    let c0_id = create_commit(
        &repo,
        "file0.txt",
        "initial",
        "Commit C0",
        &[],
        Some("HEAD"),
        1000,
    );
    let c0 = repo.find_commit(c0_id).expect("find C0");

    // Ensure branch named "main" exists and HEAD points to it
    let _ = repo.branch("main", &c0, true).expect("create main branch");
    repo.set_head("refs/heads/main").expect("set HEAD to main");

    // 2. Create branch feature/alpha, add commit C1
    let _ = repo
        .branch("feature/alpha", &c0, false)
        .expect("create feature/alpha branch");
    let c1_id = create_commit(
        &repo,
        "alpha.txt",
        "alpha content",
        "Commit C1",
        &[&c0],
        Some("refs/heads/feature/alpha"),
        1010,
    );
    let c1 = repo.find_commit(c1_id).expect("find C1");

    // 3. Switch back to main, add commit C2
    let c2_id = create_commit(
        &repo,
        "main.txt",
        "main content",
        "Commit C2",
        &[&c0],
        Some("refs/heads/main"),
        1020,
    );
    let c2 = repo.find_commit(c2_id).expect("find C2");

    // 4. Merge feature/alpha into main creating merge commit C3 (parents: C2 and C1)
    let c3_id = create_commit(
        &repo,
        "merged.txt",
        "merged content",
        "Merge branch feature/alpha into main",
        &[&c2, &c1],
        Some("refs/heads/main"),
        1030,
    );

    let path_str = dir.path().to_str().expect("valid utf-8 path");
    let commits = build_commit_graph(path_str, 100).expect("build commit graph");

    // Assert returns 4 commits
    assert_eq!(commits.len(), 4, "should return exactly 4 commits");

    // Assert C3 is head, has 2 parent IDs (C2 and C1)
    let c3_commit = &commits[0];
    assert_eq!(c3_commit.id, c3_id.to_string());
    assert!(c3_commit.is_head, "C3 should be HEAD");
    assert_eq!(
        c3_commit.parent_ids,
        vec![c2_id.to_string(), c1_id.to_string()],
        "C3 parent IDs must be [C2, C1]"
    );
    assert!(
        c3_commit.branch_names.contains(&"main".to_string()),
        "C3 branch_names must contain 'main'"
    );

    // Assert lane indices: main stays in lane 0, alpha branches out into lane 1 and converges back
    let c2_commit = commits.iter().find(|c| c.id == c2_id.to_string()).unwrap();
    let c1_commit = commits.iter().find(|c| c.id == c1_id.to_string()).unwrap();
    let c0_commit = commits.iter().find(|c| c.id == c0_id.to_string()).unwrap();

    assert_eq!(c3_commit.lane, 0, "C3 (main merge) should be in lane 0");
    assert_eq!(c2_commit.lane, 0, "C2 (main) should be in lane 0");
    assert_eq!(c1_commit.lane, 1, "C1 (feature/alpha) should branch into lane 1");
    assert_eq!(c0_commit.lane, 0, "C0 (root/main base) should converge back to lane 0");
}

#[test]
fn test_build_commit_graph_edge_cases() {
    // Edge case 1: repo with 0 commits returns empty Vec
    let empty_dir = tempdir().expect("create empty temp dir");
    let _empty_repo = git2::Repository::init(empty_dir.path()).expect("init empty repo");

    let empty_path = empty_dir.path().to_str().expect("valid utf-8 path");
    let empty_commits = build_commit_graph(empty_path, 100).expect("build graph on empty repo");
    assert!(
        empty_commits.is_empty(),
        "repo with 0 commits must return empty Vec"
    );

    // Edge case 2: detached HEAD commit is marked is_head: true
    let dir = tempdir().expect("create temp dir");
    let repo = git2::Repository::init(dir.path()).expect("init repo");
    let c0_id = create_commit(
        &repo,
        "base.txt",
        "base",
        "Base commit",
        &[],
        Some("HEAD"),
        1000,
    );
    let c0 = repo.find_commit(c0_id).expect("find c0");

    let c1_id = create_commit(
        &repo,
        "second.txt",
        "second",
        "Second commit",
        &[&c0],
        Some("HEAD"),
        1010,
    );

    // Detach HEAD to c0
    repo.set_head_detached(c0_id).expect("detach HEAD to c0");

    let path_str = dir.path().to_str().expect("valid utf-8 path");
    let commits = build_commit_graph(path_str, 100).expect("build graph with detached HEAD");

    assert_eq!(commits.len(), 2);
    let commit_c0 = commits.iter().find(|c| c.id == c0_id.to_string()).unwrap();
    let commit_c1 = commits.iter().find(|c| c.id == c1_id.to_string()).unwrap();

    assert!(commit_c0.is_head, "detached HEAD commit must have is_head = true");
    assert!(!commit_c1.is_head, "non-HEAD commit must have is_head = false");
}
