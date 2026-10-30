import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCw,
  GitPullRequest,
  MessageSquare,
  GitBranch,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { PullRequestItem } from '../../types/git';
import { ForkSyncButton } from './ForkSyncButton';
import { PrDetailView } from './PrDetailView';
import { useGitStore } from '../../store/gitStore';

export interface PrStudioProps {
  initialPrs?: PullRequestItem[];
  repoOwner?: string;
  repoName?: string;
  onSelectPr?: (pr: PullRequestItem) => void;
}

type StateFilter = 'all' | 'open' | 'merged' | 'closed';

export function PrStudio({
  initialPrs,
  repoOwner,
  repoName,
  onSelectPr,
}: PrStudioProps) {
  const [prs, setPrs] = useState<PullRequestItem[]>(initialPrs ?? []);
  const [selectedPr, setSelectedPr] = useState<PullRequestItem | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffMap, setDiffMap] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const repoInfo = useGitStore((s) => s.repoInfo);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  // Resolve owner & repo from props or detect from git remote origin
  const [resolvedOwner, setResolvedOwner] = useState(repoOwner || '');
  const [resolvedRepo, setResolvedRepo] = useState(repoName || '');

  useEffect(() => {
    if (repoOwner && repoName) {
      setResolvedOwner(repoOwner);
      setResolvedRepo(repoName);
      return;
    }
    const repoPath = repoInfo?.path;
    if (isTauri && repoPath) {
      invoke<{ stdout: string; exit_code: number }>('execute_git_command', {
        repoPath,
        args: ['remote', 'get-url', 'origin'],
      })
        .then((res) => {
          if (res.exit_code === 0 && res.stdout) {
            const match = res.stdout.trim().match(/[:/]([^/:]+)\/([^/:]+?)(\.git)?$/);
            if (match) {
              setResolvedOwner(match[1]);
              setResolvedRepo(match[2]);
            }
          }
        })
        .catch(() => {});
    }
  }, [repoOwner, repoName, repoInfo?.path, isTauri]);

  const loadPrs = useCallback(async () => {
    if (initialPrs && initialPrs.length > 0 && !isTauri) {
      setPrs(initialPrs);
      return;
    }
    if (!isTauri || !resolvedOwner || !resolvedRepo) return;

    try {
      setIsLoading(true);
      setError(null);
      const fetched = await invoke<PullRequestItem[]>('fetch_pull_requests', {
        owner: resolvedOwner,
        repo: resolvedRepo,
      });
      setPrs(fetched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [initialPrs, isTauri, resolvedOwner, resolvedRepo]);

  useEffect(() => {
    if (initialPrs) {
      setPrs(initialPrs);
    } else if (resolvedOwner && resolvedRepo) {
      loadPrs();
    }
  }, [initialPrs, resolvedOwner, resolvedRepo, loadPrs]);

  const handleSelectPr = async (pr: PullRequestItem) => {
    setSelectedPr(pr);
    onSelectPr?.(pr);

    if (diffMap[pr.number] !== undefined) return;

    if (isTauri) {
      try {
        setIsLoadingDiff(true);
        const diffText = await invoke<string>('fetch_pr_diff', {
          owner: resolvedOwner,
          repo: resolvedRepo,
          prNumber: pr.number,
        });
        setDiffMap((prev) => ({ ...prev, [pr.number]: diffText }));
      } catch {
        // Leave diff undefined
      } finally {
        setIsLoadingDiff(false);
      }
    }
  };

  // Filtered PR list
  const filteredPrs = useMemo(() => {
    return prs.filter((pr) => {
      // Filter by state
      if (stateFilter !== 'all') {
        if (pr.state.toUpperCase() !== stateFilter.toUpperCase()) {
          return false;
        }
      }

      // Filter by search query (title, author, number)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = pr.title.toLowerCase().includes(q);
        const matchesAuthor = pr.author.toLowerCase().includes(q);
        const matchesNumber = pr.number.toString().includes(q.replace(/^#/, ''));
        if (!matchesTitle && !matchesAuthor && !matchesNumber) {
          return false;
        }
      }

      return true;
    });
  }, [prs, stateFilter, searchQuery]);

  return (
    <div
      data-testid="pr-studio-container"
      className="h-full w-full flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* Top Action Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-2 mr-2">
            <GitPullRequest className="w-5 h-5 text-purple-400" />
            <h1 className="text-sm font-semibold text-slate-100 tracking-wide">
              Pull Requests
            </h1>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              data-testid="pr-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by title, author, #..."
              className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-52 sm:w-64 transition-colors"
            />
          </div>

          {/* State Filter Pills */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 text-xs">
            <button
              type="button"
              data-testid="pr-filter-all"
              onClick={() => setStateFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                stateFilter === 'all'
                  ? 'bg-purple-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-testid="pr-filter-open"
              onClick={() => setStateFilter('open')}
              className={`px-2.5 py-1 rounded transition-colors ${
                stateFilter === 'open'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              data-testid="pr-filter-merged"
              onClick={() => setStateFilter('merged')}
              className={`px-2.5 py-1 rounded transition-colors ${
                stateFilter === 'merged'
                  ? 'bg-purple-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Merged
            </button>
            <button
              type="button"
              data-testid="pr-filter-closed"
              onClick={() => setStateFilter('closed')}
              className={`px-2.5 py-1 rounded transition-colors ${
                stateFilter === 'closed'
                  ? 'bg-rose-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Closed
            </button>
          </div>
        </div>

        {/* Right Tools: Fork Sync & Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <ForkSyncButton />
          <button
            type="button"
            data-testid="pr-refresh-btn"
            onClick={loadPrs}
            disabled={isLoading}
            title="Refresh Pull Requests"
            className="p-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error notification if any */}
      {error && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Master-Detail Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: PR List */}
        <div
          data-testid="pr-list-column"
          className="w-full md:w-80 lg:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col min-h-0 overflow-hidden shrink-0"
        >
          <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
            <span>{filteredPrs.length} pull requests</span>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredPrs.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No pull requests found
              </div>
            ) : (
              filteredPrs.map((pr) => {
                const isSelected = selectedPr?.number === pr.number;
                const stateColor =
                  pr.state.toUpperCase() === 'OPEN'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : pr.state.toUpperCase() === 'MERGED'
                    ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                return (
                  <div
                    key={pr.number}
                    data-testid={`pr-card-${pr.number}`}
                    onClick={() => handleSelectPr(pr)}
                    className={`p-3 cursor-pointer transition-colors text-left ${
                      isSelected
                        ? 'bg-purple-950/30 border-l-2 border-l-purple-500'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 font-mono text-[11px] font-semibold">
                            #{pr.number}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${stateColor}`}
                          >
                            {pr.state}
                          </span>
                        </div>
                        <h3 className="mt-1 text-xs font-semibold text-slate-200 line-clamp-2 leading-snug">
                          {pr.title}
                        </h3>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          <span>@{pr.author}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-2.5 h-2.5 text-slate-500" />
                            <span className="truncate max-w-[100px]">{pr.head_ref}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="w-2.5 h-2.5 text-slate-500" />
                            <span>{pr.comments_count}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detail View or Empty State */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-950">
          {selectedPr ? (
            <PrDetailView
              pr={selectedPr}
              diff={diffMap[selectedPr.number] ?? null}
              isLoadingDiff={isLoadingDiff}
              onBack={() => setSelectedPr(null)}
            />
          ) : (
            <div
              data-testid="pr-studio-empty-detail"
              className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500"
            >
              <GitPullRequest className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">
                No Pull Request Selected
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Select a pull request from the list to inspect reviews, branches, author details, and code diff.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrStudio;
