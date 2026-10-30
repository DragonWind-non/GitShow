import React, { useState } from 'react';
import {
  ArrowLeft,
  GitBranch,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  GitMerge,
  Loader2,
  ShieldCheck,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import type { PullRequestItem } from '../../types/git';
import { DiffViewer } from '../diff/DiffViewer';
import { useGitStore } from '../../store/gitStore';

export interface PrDetailViewProps {
  pr: PullRequestItem;
  diff?: string | null;
  isLoadingDiff?: boolean;
  onApprove?: (prNumber: number) => Promise<void> | void;
  onMerge?: (prNumber: number) => Promise<void> | void;
  onBack?: () => void;
}

export function PrDetailView({
  pr,
  diff,
  isLoadingDiff = false,
  onApprove,
  onMerge,
  onBack,
}: PrDetailViewProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    useGitStore.getState().setCliPreview(`gh pr review ${pr.number} --approve`);
    try {
      await onApprove?.(pr.number);
    } finally {
      setIsApproving(false);
    }
  };

  const handleMerge = async () => {
    setIsMerging(true);
    useGitStore.getState().setCliPreview(`gh pr merge ${pr.number} --merge`);
    try {
      await onMerge?.(pr.number);
    } finally {
      setIsMerging(false);
    }
  };

  const stateBadgeClass = (() => {
    switch (pr.state.toUpperCase()) {
      case 'OPEN':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'MERGED':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'CLOSED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  })();

  const reviewBadgeClass = (() => {
    if (!pr.review_decision) return '';
    switch (pr.review_decision.toUpperCase()) {
      case 'APPROVED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'CHANGES_REQUESTED':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
  })();

  return (
    <div
      data-testid="pr-detail-view"
      className="h-full flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden"
    >
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {onBack && (
              <button
                type="button"
                data-testid="pr-back-btn"
                onClick={onBack}
                title="Back to PR list"
                className="mt-0.5 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400 font-mono font-semibold text-sm">
                  #{pr.number}
                </span>
                <h2 className="text-base font-semibold text-slate-100 truncate">
                  {pr.title}
                </h2>
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold uppercase rounded-full border ${stateBadgeClass}`}
                >
                  {pr.state}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                <span className="font-medium text-slate-300">@{pr.author}</span>
                <span>wants to merge into</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-slate-300 border border-slate-700">
                  <GitBranch className="w-3 h-3 text-emerald-400" />
                  {pr.base_ref}
                </span>
                <span>from</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-slate-300 border border-slate-700">
                  <GitBranch className="w-3 h-3 text-purple-400" />
                  {pr.head_ref}
                </span>
                <span className="text-slate-600">•</span>
                <span data-testid="pr-comments-count" className="inline-flex items-center gap-1 text-slate-400">
                  <MessageSquare className="w-3 h-3" />
                  <span>{pr.comments_count}</span>
                </span>
                {pr.review_decision && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${reviewBadgeClass}`}
                  >
                    {pr.review_decision}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {pr.state.toUpperCase() === 'OPEN' && (
              <>
                <button
                  type="button"
                  data-testid="pr-approve-btn"
                  onClick={handleApprove}
                  disabled={isApproving || isMerging}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isApproving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  data-testid="pr-merge-btn"
                  onClick={handleMerge}
                  disabled={isApproving || isMerging}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isMerging ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="w-3.5 h-3.5" />
                  )}
                  <span>Merge Pull Request</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Diff Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {isLoadingDiff ? (
          <div
            data-testid="pr-diff-loading"
            className="h-full flex flex-col items-center justify-center p-8 text-slate-400 gap-2"
          >
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <p className="text-xs">Loading pull request diff...</p>
          </div>
        ) : diff ? (
          <DiffViewer diff={diff} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-slate-500 gap-2">
            <FileCode className="w-10 h-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-400">No diff available</p>
            <p className="text-xs text-slate-500">
              There are no changes or the diff could not be loaded for this pull request.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrDetailView;
