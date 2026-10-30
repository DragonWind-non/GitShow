import React, { useEffect, useState, useCallback } from 'react';
import {
  RotateCcw,
  History,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  X,
  Loader2,
  Terminal,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { UndoSnapshot } from '../../types/git';
import { useGitStore } from '../../store/gitStore';

export interface UndoModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots?: UndoSnapshot[];
  onRollback?: (snapshotId: string) => Promise<void> | void;
}

export function UndoModal({
  isOpen,
  onClose,
  snapshots: controlledSnapshots,
  onRollback,
}: UndoModalProps) {
  const [internalSnapshots, setInternalSnapshots] = useState<UndoSnapshot[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const repoInfo = useGitStore((state) => state.repoInfo);
  const setCliPreview = useGitStore((state) => state.setCliPreview);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const snapshots = controlledSnapshots ?? internalSnapshots;

  const fetchSnapshots = useCallback(async () => {
    if (controlledSnapshots !== undefined) return;
    if (!isTauri) {
      setInternalSnapshots([]);
      return;
    }
    try {
      setLoading(true);
      const res = await invoke<UndoSnapshot[]>('get_undo_stack', {
        repoPath: repoInfo?.path || '',
      });
      setInternalSnapshots(res || []);
    } catch {
      setInternalSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [controlledSnapshots, isTauri, repoInfo?.path]);

  useEffect(() => {
    if (isOpen) {
      void fetchSnapshots();
    }
  }, [isOpen, fetchSnapshots]);

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

  if (!isOpen) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // Clipboard write failed
    }
  };

  const handleRollback = async (snapshot: UndoSnapshot) => {
    setRollingBackId(snapshot.id);
    setCliPreview(snapshot.restore_cli_command);

    try {
      if (onRollback) {
        await onRollback(snapshot.id);
      } else if (isTauri) {
        await invoke('rollback_snapshot', {
          repoPath: repoInfo?.path || '',
          snapshotId: snapshot.id,
        });
        await fetchSnapshots();
      }
    } catch {
      // Handle or report error
    } finally {
      setRollingBackId(null);
    }
  };

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts > 1e11 ? ts : ts * 1000);
    return d.toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        data-testid="undo-modal-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Dialog */}
      <div
        data-testid="undo-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Safe Undo Reflog Time Machine"
        className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Safe Undo & Reflog Time Machine
              </h2>
              <p className="text-xs text-slate-400">
                1-Click Rollback previous repository mutations with dangling stash recovery.
              </p>
            </div>
          </div>
          <button
            data-testid="close-undo-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs">Loading pre-mutation snapshots...</p>
            </div>
          ) : snapshots.length === 0 ? (
            <div
              data-testid="undo-empty-state"
              className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40"
            >
              <div className="p-3 rounded-full bg-slate-800/60 text-slate-400 mb-3">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-200">No undo snapshots available</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Destructive actions such as resets, rebases, and branch deletions will automatically
                record recovery snapshots here.
              </p>
            </div>
          ) : (
            <div data-testid="undo-snapshot-list" className="space-y-4">
              {snapshots.map((s, index) => {
                const isRolling = rollingBackId === s.id;
                const isCopied = copiedId === s.id;
                const shortSha = s.pre_head_sha.slice(0, 7);

                return (
                  <div
                    key={s.id}
                    data-testid={`undo-snapshot-${s.id}`}
                    className="relative pl-6 pb-2 border-l-2 border-slate-800 last:border-transparent group"
                  >
                    {/* Timeline Node Icon */}
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center" />

                    {/* Snapshot Card */}
                    <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all space-y-3">
                      {/* Top Row: Action Name + Time */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-slate-100">
                              {s.action_name}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                              {shortSha}
                            </span>
                            {s.dangling_stash_sha && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                Stash: {s.dangling_stash_sha}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimestamp(s.timestamp)}</span>
                          </div>
                        </div>

                        {/* Rollback Button */}
                        <button
                          type="button"
                          onClick={() => handleRollback(s)}
                          disabled={isRolling}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                        >
                          {isRolling ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Rolling back...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Rollback</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Restore Command Preview Box */}
                      <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                          <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{s.restore_cli_command}</span>
                        </div>
                        <button
                          type="button"
                          data-testid="copy-restore-cmd"
                          onClick={() => handleCopy(s.id, s.restore_cli_command)}
                          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 shrink-0"
                          title="Copy restore command"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Pre-mutation snapshots protect against uncommitted data loss.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default UndoModal;
