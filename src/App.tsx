import React, { useEffect, useState, useCallback } from 'react';
import { FolderOpen, AlertCircle, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AppLayout } from './components/layout/AppLayout';
import { useGitStore } from './store/gitStore';
import type { RepoInfo, BranchInfo, DagCommit } from './types/git';

export interface AppProps {
  initialRepoPath?: string;
}

export function App({ initialRepoPath }: AppProps = {}) {
  const theme = useGitStore((state) => state.theme);
  const repoInfo = useGitStore((state) => state.repoInfo);
  const setRepoInfo = useGitStore((state) => state.setRepoInfo);
  const setBranches = useGitStore((state) => state.setBranches);
  const setCommits = useGitStore((state) => state.setCommits);

  const [inputPath, setInputPath] = useState(initialRepoPath || '');
  const [isOpenModalVisible, setIsOpenModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRepository = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) return;
      setIsLoading(true);
      setError(null);
      try {
        const repo = await invoke<RepoInfo>('open_repository', { path: trimmed });
        setRepoInfo(repo);

        try {
          const branches = await invoke<BranchInfo[]>('list_branches', { path: trimmed });
          setBranches(branches);
        } catch {
          // Keep existing or empty branches
        }

        try {
          const commits = await invoke<DagCommit[]>('build_commit_graph', {
            repoPath: trimmed,
          });
          setCommits(commits);
        } catch {
          // Keep existing or empty commits
        }

        setIsOpenModalVisible(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [setBranches, setCommits, setRepoInfo]
  );

  useEffect(() => {
    if (initialRepoPath) {
      setInputPath(initialRepoPath);
      void openRepository(initialRepoPath);
    }
  }, [initialRepoPath, openRepository]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  // Handle external or custom dispatch to open a repo
  useEffect(() => {
    const handleOpenRepoEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setInputPath(customEvent.detail);
        void openRepository(customEvent.detail);
      }
    };
    window.addEventListener('gitshow:open-repo', handleOpenRepoEvent);
    return () => {
      window.removeEventListener('gitshow:open-repo', handleOpenRepoEvent);
    };
  }, [openRepository]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Quick Repository Action Bar / Trigger */}
      {!repoInfo && (
        <div
          data-testid="open-repo-banner"
          className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-300 z-30"
        >
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            <span className="font-medium text-slate-200">No repository opened</span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              data-testid="open-repo-input"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void openRepository(inputPath);
              }}
              placeholder="Enter local repo path..."
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-64 text-xs font-mono"
            />
            <button
              type="button"
              data-testid="open-repo-trigger"
              onClick={() => void openRepository(inputPath)}
              disabled={isLoading}
              className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 mr-1" />
              )}
              <span>Open Repository</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          data-testid="open-repo-error"
          className="bg-rose-950/80 border-b border-rose-800 px-4 py-1.5 flex items-center space-x-2 text-xs text-rose-300 z-30"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Studio Application */}
      <div className="flex-1 min-h-0">
        <AppLayout />
      </div>
    </div>
  );
}

export default App;
