import React, { useState, useEffect, useCallback } from 'react';
import {
  GitMerge,
  X,
  Terminal,
  Loader2,
  AlertCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { RebaseAction, RebaseItem } from '../../types/git';
import { RebaseItemRow } from './RebaseItemRow';
import { useGitStore } from '../../store/gitStore';

export interface InteractiveRebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseSha?: string;
  targetBranch?: string;
  initialItems?: RebaseItem[];
  onRebase?: (baseSha: string, items: RebaseItem[]) => Promise<void> | void;
}

export function InteractiveRebaseModal({
  isOpen,
  onClose,
  baseSha = 'HEAD~3',
  targetBranch,
  initialItems,
  onRebase,
}: InteractiveRebaseModalProps) {
  const repoInfo = useGitStore((state) => state.repoInfo);
  const commits = useGitStore((state) => state.commits);
  const setCliPreview = useGitStore((state) => state.setCliPreview);

  const [items, setItems] = useState<RebaseItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize items from props or store commits
  useEffect(() => {
    if (!isOpen) return;
    if (initialItems && initialItems.length > 0) {
      setItems(initialItems);
    } else if (commits && commits.length > 0) {
      // Default to top commits as pick, ordered oldest-to-newest for git-rebase-todo
      const defaultItems: RebaseItem[] = commits
        .slice(0, 5)
        .reverse()
        .map((c) => ({
          sha: c.id,
          action: 'pick',
          message: c.summary,
        }));
      setItems(defaultItems);
    } else {
      setItems([]);
    }
    setErrorMessage(null);
  }, [isOpen, initialItems, commits]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChangeAction = useCallback((index: number, action: RebaseAction) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], action };
      return next;
    });
  }, []);

  const handleChangeMessage = useCallback((index: number, message: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], message };
      return next;
    });
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    if (initialItems) {
      setItems(initialItems);
    }
  }, [initialItems]);

  const handleStartRebase = async () => {
    const cliCmd = `git rebase -i ${baseSha}`;
    setCliPreview(cliCmd);
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (onRebase) {
        await onRebase(baseSha, items);
      } else {
        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
        if (isTauri) {
          await invoke('execute_interactive_rebase', {
            repo: repoInfo?.path || '',
            baseSha,
            items,
          });
        }
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="rebase-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Backdrop */}
      <div
        data-testid="rebase-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 -z-10"
      />

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-950/70 text-sky-400 border border-sky-800/60">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Interactive Rebase
                {targetBranch && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    onto {targetBranch}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Reorder, squash, reword, or drop commits onto{' '}
                <span className="font-mono text-slate-300">{baseSha}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-rebase-modal"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CLI Command Preview Banner */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>git rebase -i {baseSha}</span>
          </div>
          {initialItems && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
              title="Reset order and actions"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 break-words">{errorMessage}</div>
          </div>
        )}

        {/* Rebase Item List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 min-h-0">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No commits to rebase in this range.
            </div>
          ) : (
            items.map((item, index) => (
              <RebaseItemRow
                key={item.sha}
                item={item}
                index={index}
                totalItems={items.length}
                onChangeAction={handleChangeAction}
                onChangeMessage={handleChangeMessage}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))
          )}
        </div>

        {/* Action legend */}
        <div className="px-5 py-2 border-t border-slate-800/60 bg-slate-950/20 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="text-slate-500 font-medium">Actions:</span>
          <span><strong className="text-emerald-400">pick</strong>: use commit</span>
          <span><strong className="text-purple-400">squash</strong>: meld into previous</span>
          <span><strong className="text-sky-400">reword</strong>: edit message</span>
          <span><strong className="text-rose-400">drop</strong>: remove</span>
          <span><strong className="text-amber-400">fixup</strong>: meld without message</span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            type="button"
            data-testid="cancel-rebase-btn"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="start-rebase-btn"
            onClick={handleStartRebase}
            disabled={isSubmitting || items.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Rebasing...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Rebase</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
