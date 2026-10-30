import { create } from 'zustand';
import type { BranchInfo, DagCommit, FileStatus, RepoInfo, StashInfo, TagInfo } from '../types/git';

export type ActiveView = 'history' | 'rebase' | 'pull-requests' | 'undo';
export type AppTheme = 'dark' | 'light';

export interface GitStoreState {
  repoInfo: RepoInfo | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashInfo[];
  commits: DagCommit[];
  selectedCommit: DagCommit | null;
  stagedFiles: FileStatus[];
  unstagedFiles: FileStatus[];
  cliPreview: string;
  isTerminalOpen: boolean;
  theme: AppTheme;
  activeView: ActiveView;

  // Actions
  setRepoInfo: (info: RepoInfo | null) => void;
  setBranches: (branches: BranchInfo[]) => void;
  setTags: (tags: TagInfo[]) => void;
  setStashes: (stashes: StashInfo[]) => void;
  setCommits: (commits: DagCommit[]) => void;
  selectCommit: (commit: DagCommit | null) => void;
  setFiles: (staged: FileStatus[], unstaged: FileStatus[]) => void;
  setCliPreview: (cmd: string) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  setTheme: (theme: AppTheme) => void;
  setActiveView: (view: ActiveView) => void;
}

export const useGitStore = create<GitStoreState>((set) => ({
  repoInfo: null,
  branches: [],
  tags: [],
  stashes: [],
  commits: [],
  selectedCommit: null,
  stagedFiles: [],
  unstagedFiles: [],
  cliPreview: '',
  isTerminalOpen: false,
  theme: 'dark',
  activeView: 'history',

  setRepoInfo: (info) => set({ repoInfo: info }),
  setBranches: (branches) => set({ branches }),
  setTags: (tags) => set({ tags }),
  setStashes: (stashes) => set({ stashes }),
  setCommits: (commits) => set({ commits }),
  selectCommit: (commit) => set({ selectedCommit: commit }),
  setFiles: (staged, unstaged) => set({ stagedFiles: staged, unstagedFiles: unstaged }),
  setCliPreview: (cmd) => set({ cliPreview: cmd }),
  toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
  setTerminalOpen: (open) => set({ isTerminalOpen: open }),
  setTheme: (theme) => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ theme });
  },
  setActiveView: (view) => set({ activeView: view }),
}));
