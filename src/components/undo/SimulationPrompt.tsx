import React, { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileWarning,
  GitCommit,
  Loader2,
  X,
} from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

export interface SimulationPromptProps {
  isOpen: boolean;
  actionName: string; // e.g. "Hard Reset (git reset --hard)"
  targetRef?: string; // e.g. "HEAD~1 (a1b2c3d)"
  currentRef?: string; // e.g. "main (e4f5g6h)"
  orphanedCommitsCount?: number;
  uncommittedFilesCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSimulating?: boolean;
}

export function SimulationPrompt({
  isOpen,
  actionName,
  targetRef,
  currentRef,
  orphanedCommitsCount = 0,
  uncommittedFilesCount = 0,
  onConfirm,
  onCancel,
  isSimulating = false,
}: SimulationPromptProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSimulating) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSimulating, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        data-testid="simulation-prompt-backdrop"
        onClick={() => {
          if (!isSimulating) onCancel();
        }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
      />

      {/* Dialog */}
      <div
        data-testid="simulation-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-label="Simulation Preview Warning"
        className="relative z-10 w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-amber-500/5">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-300">
                {t('undoWarningTitle')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{actionName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSimulating}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* State Transition Diff */}
          {(currentRef || targetRef) && (
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] uppercase font-semibold text-slate-500">
                  Current Ref
                </span>
                <p className="font-mono text-slate-300 font-medium truncate">
                  {currentRef || 'HEAD'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 shrink-0 mx-2" />
              <div className="space-y-0.5 text-right min-w-0">
                <span className="text-[10px] uppercase font-semibold text-amber-400">
                  Target Ref
                </span>
                <p className="font-mono text-amber-300 font-medium truncate">
                  {targetRef || 'Target'}
                </p>
              </div>
            </div>
          )}

          {/* Impact Warnings */}
          <div className="space-y-2">
            {orphanedCommitsCount > 0 && (
              <div
                data-testid="orphaned-commits-warning"
                className="flex items-start gap-2.5 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300"
              >
                <GitCommit className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <span className="font-semibold">
                    {orphanedCommitsCount} orphaned commit{orphanedCommitsCount > 1 ? 's' : ''}
                  </span>{' '}
                  will be disconnected from the current branch HEAD.
                </div>
              </div>
            )}

            {uncommittedFilesCount > 0 && (
              <div
                data-testid="uncommitted-files-warning"
                className="flex items-start gap-2.5 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300"
              >
                <FileWarning className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-semibold">
                    {uncommittedFilesCount} uncommitted file{uncommittedFilesCount > 1 ? 's' : ''}
                  </span>{' '}
                  will be overwritten or discarded.
                </div>
              </div>
            )}
          </div>

          {/* Safe Undo Protection Reassurance */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <div className="leading-relaxed">
              Safe Undo Active: GitShow will automatically capture a pre-mutation snapshot and
              dangling stash before executing. You can undo this action at any time.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-slate-800 bg-slate-950/40">
          <button
            type="button"
            data-testid="simulation-cancel-btn"
            onClick={onCancel}
            disabled={isSimulating}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 transition-colors disabled:opacity-50"
          >
            {t('undoWarningCancel')}
          </button>
          <button
            type="button"
            data-testid="simulation-confirm-btn"
            onClick={onConfirm}
            disabled={isSimulating}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isSimulating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : (
              <span>{t('undoWarningConfirm')}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SimulationPrompt;
