import { create } from 'zustand';
import type { BranchInfo, DagCommit, FileStatus, RepoInfo, StashInfo, TagInfo } from '../types/git';
import type { Language } from '../i18n/translations';

export type ActiveView = 'history' | 'rebase' | 'pull-requests' | 'undo';
export type AppTheme = 'dark' | 'light';

function getInitialLanguage(): Language {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('gitshow_language');
      if (saved === 'en' || saved === 'vi') return saved;
      if (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('vi')) {
        return 'vi';
      }
    } catch {
      // ignore
    }
  }
  return 'en';
}

export interface GitStoreState {
  repoInfo: RepoInfo | null;
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashInfo[];
  commits: DagCommit[];
  selectedCommit: DagCommit | null;
  selectedFile: FileStatus | null;
  activeDiff: string | null;
  stagedFiles: FileStatus[];
  unstagedFiles: FileStatus[];
  cliPreview: string;
  isTerminalOpen: boolean;
  theme: AppTheme;
  language: Language;
  activeView: ActiveView;

  // Actions
  setRepoInfo: (info: RepoInfo | null) => void;
  setBranches: (branches: BranchInfo[]) => void;
  setTags: (tags: TagInfo[]) => void;
  setStashes: (stashes: StashInfo[]) => void;
  setCommits: (commits: DagCommit[]) => void;
  selectCommit: (commit: DagCommit | null) => void;
  selectFile: (file: FileStatus | null) => void;
  setActiveDiff: (diff: string | null) => void;
  setFiles: (staged: FileStatus[], unstaged: FileStatus[]) => void;
  setCliPreview: (cmd: string) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  setTheme: (theme: AppTheme) => void;
  setLanguage: (lang: Language) => void;
  setActiveView: (view: ActiveView) => void;
}

export const useGitStore = create<GitStoreState>((set) => ({
  repoInfo: null,
  branches: [],
  tags: [],
  stashes: [],
  commits: [],
  selectedCommit: null,
  selectedFile: null,
  activeDiff: null,
  stagedFiles: [],
  unstagedFiles: [],
  cliPreview: '',
  isTerminalOpen: false,
  theme: 'dark',
  language: getInitialLanguage(),
  activeView: 'history',

  setRepoInfo: (info) => set({ repoInfo: info }),
  setBranches: (branches) => set({ branches }),
  setTags: (tags) => set({ tags }),
  setStashes: (stashes) => set({ stashes }),
  setCommits: (commits) => set({ commits }),
  selectCommit: (commit) => set({ selectedCommit: commit }),
  selectFile: (file) => set({ selectedFile: file }),
  setActiveDiff: (diff) => set({ activeDiff: diff }),
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
  setLanguage: (lang) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('gitshow_language', lang);
      } catch {
        // ignore
      }
    }
    set({ language: lang });
  },
  setActiveView: (view) => set({ activeView: view }),
}));
