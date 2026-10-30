export interface RepoInfo {
  path: string;
  current_branch: string | null;
  is_detached: boolean;
  is_clean: boolean;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  target_commit: string;
}

export interface TagInfo {
  name: string;
  target_commit: string;
  message?: string | null;
}

export interface DagCommit {
  id: string;
  short_id: string;
  summary: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  parent_ids: string[];
  lane: number;
  branch_names: string[];
  is_head: boolean;
}

export interface FileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
}

export interface StashInfo {
  index: number;
  message: string;
  commit_id?: string;
}

export interface UndoSnapshot {
  id: string;
  timestamp: number;
  action_name: string;
  pre_head_sha: string;
  dangling_stash_sha?: string | null;
  restore_cli_command: string;
}

export type RebaseAction = 'pick' | 'squash' | 'reword' | 'drop' | 'fixup';

export interface RebaseItem {
  action: RebaseAction;
  sha: string;
  message: string;
}

