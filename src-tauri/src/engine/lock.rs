use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[derive(Clone, Default)]
pub struct RepoLockManager {
    locks: Arc<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>>,
}

pub fn normalize_repo_path(repo: &Path) -> PathBuf {
    let path = if let Ok(canon) = std::fs::canonicalize(repo) {
        let s = canon.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            PathBuf::from(stripped)
        } else {
            canon
        }
    } else {
        repo.to_path_buf()
    };

    let s = path.to_string_lossy();
    let trimmed = s.trim_end_matches(['/', '\\']).replace('/', "\\");

    #[cfg(windows)]
    {
        PathBuf::from(trimmed.to_lowercase())
    }
    #[cfg(not(windows))]
    {
        PathBuf::from(trimmed)
    }
}

pub fn get_index_lock_path(repo_path: &Path) -> PathBuf {
    let direct = repo_path.join(".git").join("index.lock");
    if direct.exists() {
        return direct;
    }
    if let Ok(repo) = git2::Repository::open(repo_path) {
        let git_lock = repo.path().join("index.lock");
        if git_lock.exists() {
            return git_lock;
        }
    }
    direct
}

pub fn is_stale_index_lock(lock_path: &Path, max_age: Duration) -> bool {
    if let Ok(metadata) = std::fs::metadata(lock_path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                return elapsed > max_age;
            }
        }
    }
    false
}

impl RepoLockManager {
    pub fn new() -> Self {
        Self {
            locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_repo_mutex(&self, repo: &Path) -> Arc<Mutex<()>> {
        let key = normalize_repo_path(repo);
        let mut map = self.locks.lock().await;
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub async fn wait_for_index_lock_release(
        repo: &Path,
        max_wait: Duration,
    ) -> Result<(), String> {
        let start = std::time::Instant::now();
        let mut interval = Duration::from_millis(20);
        let max_interval = Duration::from_millis(200);

        while get_index_lock_path(repo).exists() {
            if start.elapsed() >= max_wait {
                let lock_path = get_index_lock_path(repo);
                if is_stale_index_lock(&lock_path, Duration::from_secs(600)) {
                    return Err(format!(
                        "Repository index is locked by a stale lock file: '{}' (older than 10 minutes). Remove this file manually if no Git process is running.",
                        lock_path.display()
                    ));
                }
                return Err(format!(
                    "Repository index is locked: '{}' still exists after waiting {:?}",
                    lock_path.display(),
                    max_wait
                ));
            }

            let remaining = max_wait.saturating_sub(start.elapsed());
            let sleep_duration = interval.min(remaining);
            tokio::time::sleep(sleep_duration).await;
            interval = (interval * 2).min(max_interval);
        }

        Ok(())
    }

    pub async fn with_mutation_lock<T, F, Fut>(&self, repo: &str, f: F) -> Result<T, String>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        let repo_path = Path::new(repo);
        let repo_mutex = self.get_repo_mutex(repo_path).await;
        let _guard = repo_mutex.lock().await;

        // Check physical index.lock with exponential backoff (up to 3 seconds)
        Self::wait_for_index_lock_release(repo_path, Duration::from_secs(3)).await?;

        // shortcut: file watcher pause/resume will be wired when watcher module is implemented in Task 5+
        f().await
    }

    pub fn is_locked(&self, repo: &str) -> bool {
        let repo_path = Path::new(repo);
        let key = normalize_repo_path(repo_path);

        // 1. Check physical index.lock file
        if get_index_lock_path(repo_path).exists() {
            return true;
        }

        // 2. Check in-memory mutex
        for _ in 0..10 {
            if let Ok(map) = self.locks.try_lock() {
                if let Some(m) = map.get(&key) {
                    return m.try_lock().is_err();
                }
                return false;
            }
            std::thread::yield_now();
        }

        true
    }
}
