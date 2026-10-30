import React, { useState } from 'react';
import { GitFork, Loader2, Check, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useGitStore } from '../../store/gitStore';

export interface ForkSyncButtonProps {
  upstreamBranch?: string; // defaults to "main"
  onSync?: () => Promise<void> | void;
  className?: string;
}

export function ForkSyncButton({
  upstreamBranch = 'main',
  onSync,
  className = '',
}: ForkSyncButtonProps) {
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSync = async () => {
    if (syncState === 'syncing') return;
    const cmd = `git fetch upstream && git merge upstream/${upstreamBranch}`;
    useGitStore.getState().setCliPreview(cmd);
    setSyncState('syncing');
    setErrorMessage(null);

    try {
      if (onSync) {
        await onSync();
      } else {
        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
        if (isTauri) {
          const repoPath = useGitStore.getState().repoInfo?.path ?? '';
          const fetchRes = await invoke<{ exit_code: number; stderr: string }>('execute_git_command', {
            repoPath,
            args: ['fetch', 'upstream'],
          });
          if (fetchRes.exit_code !== 0) {
            throw new Error(fetchRes.stderr || 'git fetch upstream failed');
          }
          const mergeRes = await invoke<{ exit_code: number; stderr: string }>('execute_git_command', {
            repoPath,
            args: ['merge', `upstream/${upstreamBranch}`],
          });
          if (mergeRes.exit_code !== 0) {
            throw new Error(mergeRes.stderr || `git merge upstream/${upstreamBranch} failed`);
          }
        }
      }
      setSyncState('success');
      setTimeout(() => {
        setSyncState('idle');
      }, 2500);
    } catch (err: unknown) {
      setSyncState('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        data-testid="fork-sync-btn"
        onClick={handleSync}
        disabled={syncState === 'syncing'}
        title={`Sync fork with upstream/${upstreamBranch}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
          syncState === 'syncing'
            ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed'
            : syncState === 'success'
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
            : syncState === 'error'
            ? 'bg-rose-950/60 text-rose-300 border-rose-700'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600'
        }`}
      >
        {syncState === 'syncing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />}
        {syncState === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
        {syncState === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
        {syncState === 'idle' && <GitFork className="w-3.5 h-3.5 text-purple-400" />}

        <span>
          {syncState === 'syncing'
            ? 'Syncing...'
            : syncState === 'success'
            ? 'Synced!'
            : syncState === 'error'
            ? 'Sync Failed'
            : 'Sync Fork'}
        </span>
      </button>

      {syncState === 'error' && errorMessage && (
        <div
          data-testid="fork-sync-error"
          className="absolute left-0 top-full mt-1.5 z-20 px-2.5 py-1.5 bg-rose-950 border border-rose-800 text-rose-300 text-[11px] rounded shadow-lg max-w-xs whitespace-normal break-words"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export default ForkSyncButton;
