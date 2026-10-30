use git2::{Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DagCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parent_ids: Vec<String>,
    pub lane: usize,
    pub branch_names: Vec<String>,
    pub is_head: bool,
}

pub fn build_commit_graph(repo_path: &str, max_count: usize) -> Result<Vec<DagCommit>, String> {
    if max_count == 0 {
        return Ok(Vec::new());
    }

    let repo = Repository::open(repo_path).map_err(|e| e.to_string())?;

    if repo.is_empty().unwrap_or(false) {
        return Ok(Vec::new());
    }

    let head_oid = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok().map(|c| c.id()));

    let mut branch_map: HashMap<Oid, Vec<String>> = HashMap::new();
    if let Ok(branches) = repo.branches(None) {
        for branch_res in branches.flatten() {
            let (branch, _) = branch_res;
            if let Ok(Some(name)) = branch.name() {
                if let Ok(commit) = branch.get().peel_to_commit() {
                    branch_map
                        .entry(commit.id())
                        .or_default()
                        .push(name.to_string());
                }
            }
        }
    }
    for names in branch_map.values_mut() {
        names.sort();
    }

    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;

    let mut pushed_any = false;
    if revwalk.push_head().is_ok() {
        pushed_any = true;
    }
    if revwalk.push_glob("refs/heads/*").is_ok() {
        pushed_any = true;
    }
    if revwalk.push_glob("refs/remotes/*").is_ok() {
        pushed_any = true;
    }

    if !pushed_any {
        return Ok(Vec::new());
    }

    let mut commits = Vec::with_capacity(max_count.min(1024));
    let mut active_lanes: Vec<Option<Oid>> = Vec::new();

    for oid_res in revwalk {
        if commits.len() >= max_count {
            break;
        }

        let oid = match oid_res {
            Ok(id) => id,
            Err(_) => continue,
        };

        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let lane = match active_lanes.iter().position(|slot| *slot == Some(oid)) {
            Some(idx) => {
                active_lanes[idx] = None;
                idx
            }
            None => match active_lanes.iter().position(|slot| slot.is_none()) {
                Some(idx) => idx,
                None => {
                    let idx = active_lanes.len();
                    active_lanes.push(None);
                    idx
                }
            },
        };

        let parent_oids: Vec<Oid> = commit.parent_ids().collect();

        if let Some(&first_parent) = parent_oids.first() {
            if !active_lanes.iter().any(|slot| *slot == Some(first_parent)) {
                active_lanes[lane] = Some(first_parent);
            }

            for &parent in &parent_oids[1..] {
                if !active_lanes.iter().any(|slot| *slot == Some(parent)) {
                    if let Some(slot) = active_lanes.iter().position(|s| s.is_none()) {
                        active_lanes[slot] = Some(parent);
                    } else {
                        active_lanes.push(Some(parent));
                    }
                }
            }
        }

        while active_lanes.last() == Some(&None) {
            active_lanes.pop();
        }

        let id = oid.to_string();
        let short_id = if id.len() >= 7 {
            id[..7].to_string()
        } else {
            id.clone()
        };

        let summary = commit.summary().unwrap_or_default().to_string();
        let author = commit.author();
        let author_name = author.name().unwrap_or_default().to_string();
        let author_email = author.email().unwrap_or_default().to_string();
        let timestamp = commit.time().seconds();
        let parent_ids = parent_oids.into_iter().map(|p| p.to_string()).collect();
        let branch_names = branch_map.remove(&oid).unwrap_or_default();
        let is_head = head_oid == Some(oid);

        commits.push(DagCommit {
            id,
            short_id,
            summary,
            author_name,
            author_email,
            timestamp,
            parent_ids,
            lane,
            branch_names,
            is_head,
        });
    }

    Ok(commits)
}
