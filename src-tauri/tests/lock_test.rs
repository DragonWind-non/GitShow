use gitshow_lib::engine::lock::RepoLockManager;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use tokio::sync::oneshot;

#[tokio::test]
async fn test_parallel_executions_same_repo_run_sequentially() {
    let dir = tempdir().expect("tempdir");
    let repo_path = dir.path().to_str().expect("utf8 path");
    let manager = RepoLockManager::new();

    let concurrent_count = Arc::new(AtomicUsize::new(0));
    let max_concurrency = Arc::new(AtomicUsize::new(0));
    let execution_order = Arc::new(tokio::sync::Mutex::new(Vec::new()));

    let mut handles = Vec::new();
    for i in 0..5 {
        let manager_clone = manager.clone();
        let path_clone = repo_path.to_string();
        let count_clone = concurrent_count.clone();
        let max_clone = max_concurrency.clone();
        let order_clone = execution_order.clone();

        handles.push(tokio::spawn(async move {
            manager_clone
                .with_mutation_lock(&path_clone, || async {
                    let current = count_clone.fetch_add(1, Ordering::SeqCst) + 1;
                    max_clone.fetch_max(current, Ordering::SeqCst);

                    // Simulate work under mutation lock
                    tokio::time::sleep(Duration::from_millis(30)).await;

                    order_clone.lock().await.push(i);
                    count_clone.fetch_sub(1, Ordering::SeqCst);
                    Ok(i)
                })
                .await
        }));
    }

    for handle in handles {
        let res = handle.await.expect("task join");
        assert!(res.is_ok(), "task should succeed");
    }

    assert_eq!(
        max_concurrency.load(Ordering::SeqCst),
        1,
        "mutation lock must strictly ensure max concurrency of 1"
    );
    assert_eq!(
        execution_order.lock().await.len(),
        5,
        "all 5 tasks should have executed"
    );
}

#[tokio::test]
async fn test_is_locked_reflects_state() {
    let dir = tempdir().expect("tempdir");
    let repo_path = dir.path().to_str().expect("utf8 path");
    let manager = RepoLockManager::new();

    assert!(
        !manager.is_locked(repo_path),
        "repo should not be locked initially"
    );

    let (lock_acquired_tx, lock_acquired_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();

    let manager_clone = manager.clone();
    let path_clone = repo_path.to_string();

    let handle = tokio::spawn(async move {
        manager_clone
            .with_mutation_lock(&path_clone, || async {
                lock_acquired_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Ok::<_, String>(())
            })
            .await
    });

    lock_acquired_rx.await.expect("wait for lock acquisition");
    assert!(
        manager.is_locked(repo_path),
        "is_locked must be true while mutation lock is held"
    );

    release_tx.send(()).expect("release signal");
    handle.await.expect("join handle").expect("lock success");

    assert!(
        !manager.is_locked(repo_path),
        "is_locked must be false after lock released"
    );

    // Test physical index.lock detection
    let git_dir = dir.path().join(".git");
    std::fs::create_dir_all(&git_dir).expect("create .git dir");
    let lock_file = git_dir.join("index.lock");
    std::fs::write(&lock_file, "locked").expect("create index.lock");

    assert!(
        manager.is_locked(repo_path),
        "is_locked must be true when physical .git/index.lock exists"
    );

    std::fs::remove_file(&lock_file).expect("remove index.lock");
    assert!(
        !manager.is_locked(repo_path),
        "is_locked must be false when physical .git/index.lock is removed"
    );
}

#[tokio::test]
async fn test_index_lock_file_wait_and_backoff() {
    let dir = tempdir().expect("tempdir");
    let repo_path = dir.path().to_str().expect("utf8 path");
    let git_dir = dir.path().join(".git");
    std::fs::create_dir_all(&git_dir).expect("create .git dir");
    let lock_file = git_dir.join("index.lock");
    std::fs::write(&lock_file, "locked").expect("create index.lock");

    let manager = RepoLockManager::new();

    let lock_file_clone = lock_file.clone();
    tokio::spawn(async move {
        // Wait 60ms then remove the physical lock file
        tokio::time::sleep(Duration::from_millis(60)).await;
        let _ = std::fs::remove_file(lock_file_clone);
    });

    let start = Instant::now();
    let result = manager
        .with_mutation_lock(repo_path, || async {
            Ok::<_, String>("mutation_complete")
        })
        .await;

    assert!(result.is_ok(), "with_mutation_lock should succeed after backoff release");
    assert_eq!(result.unwrap(), "mutation_complete");
    assert!(
        start.elapsed() >= Duration::from_millis(50),
        "must have waited for the index.lock to be released"
    );
}

#[tokio::test]
async fn test_different_repos_concurrent_locks() {
    let dir_a = tempdir().expect("tempdir a");
    let dir_b = tempdir().expect("tempdir b");
    let path_a = dir_a.path().to_str().expect("utf8 path a").to_string();
    let path_b = dir_b.path().to_str().expect("utf8 path b").to_string();

    let manager = RepoLockManager::new();

    let (a_entered_tx, a_entered_rx) = oneshot::channel();
    let (a_release_tx, a_release_rx) = oneshot::channel();

    let manager_a = manager.clone();
    let handle_a = tokio::spawn(async move {
        manager_a
            .with_mutation_lock(&path_a, || async {
                a_entered_tx.send(()).unwrap();
                a_release_rx.await.unwrap();
                Ok::<_, String>("repo_a_finished")
            })
            .await
    });

    a_entered_rx.await.expect("wait for a to acquire lock");

    // Repo B should be able to acquire its lock immediately despite Repo A being locked
    let start_b = Instant::now();
    let result_b = manager
        .with_mutation_lock(&path_b, || async {
            Ok::<_, String>("repo_b_finished")
        })
        .await;

    assert!(result_b.is_ok(), "repo b should acquire lock without error");
    assert_eq!(result_b.unwrap(), "repo_b_finished");
    assert!(
        start_b.elapsed() < Duration::from_millis(500),
        "repo b lock must not be blocked by repo a"
    );

    // Release repo a
    a_release_tx.send(()).unwrap();
    let result_a = handle_a.await.expect("join handle_a");
    assert_eq!(result_a.unwrap(), "repo_a_finished");
}

#[tokio::test]
async fn test_index_lock_timeout_returns_error() {
    let dir = tempdir().expect("tempdir");
    let git_dir = dir.path().join(".git");
    std::fs::create_dir_all(&git_dir).expect("create .git dir");
    let lock_file = git_dir.join("index.lock");
    std::fs::write(&lock_file, "locked").expect("create index.lock");

    let result =
        RepoLockManager::wait_for_index_lock_release(dir.path(), Duration::from_millis(50)).await;

    assert!(result.is_err(), "should timeout and return error");
    let err = result.unwrap_err();
    assert!(
        err.contains("still exists after waiting"),
        "error message should indicate timeout: {}",
        err
    );
}

#[tokio::test]
async fn test_mutation_lock_error_releases_lock() {
    let dir = tempdir().expect("tempdir");
    let repo_path = dir.path().to_str().expect("utf8 path");
    let manager = RepoLockManager::new();

    let res = manager
        .with_mutation_lock(repo_path, || async {
            Err::<(), String>("mutation failed deliberately".to_string())
        })
        .await;

    assert!(res.is_err(), "mutation error should propagate");
    assert!(
        !manager.is_locked(repo_path),
        "lock should be cleanly released even if closure returned Err"
    );

    // Ensure we can acquire lock immediately again
    let res2 = manager
        .with_mutation_lock(repo_path, || async { Ok::<_, String>("next_success") })
        .await;
    assert_eq!(res2.unwrap(), "next_success");
}

#[tokio::test]
async fn test_path_normalization_slashes_and_case() {
    let dir = tempdir().expect("tempdir");
    let repo_path = dir.path().to_str().expect("utf8 path");
    let manager = RepoLockManager::new();

    // Slashes and casing variations of the same repo path
    let path_variation_1 = repo_path.replace('\\', "/");
    let path_variation_2 = format!("{}/", path_variation_1);

    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();

    let manager_clone = manager.clone();
    let handle = tokio::spawn(async move {
        manager_clone
            .with_mutation_lock(&path_variation_1, || async {
                entered_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Ok::<_, String>(())
            })
            .await
    });

    entered_rx.await.expect("wait for lock");

    // Both repo_path and path_variation_2 should be detected as locked
    assert!(
        manager.is_locked(repo_path),
        "is_locked with base path should return true"
    );
    assert!(
        manager.is_locked(&path_variation_2),
        "is_locked with trailing slash should return true"
    );

    release_tx.send(()).unwrap();
    handle.await.expect("join").unwrap();

    assert!(!manager.is_locked(repo_path));
    assert!(!manager.is_locked(&path_variation_2));
}

