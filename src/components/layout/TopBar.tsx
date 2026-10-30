import React from 'react';
import {
  GitBranch,
  ArrowDownToLine,
  ArrowUpToLine,
  RefreshCw,
  Plus,
  Archive,
  Search,
  Terminal,
  Sun,
  Moon,
  FolderGit2,
} from 'lucide-react';
import { useGitStore } from '../../store/gitStore';
import { useTranslation } from '../../i18n/useTranslation';
import { LanguageToggle } from './LanguageToggle';

export function TopBar() {
  const {
    repoInfo,
    cliPreview,
    isTerminalOpen,
    theme,
    toggleTerminal,
    setTheme,
    setCliPreview,
  } = useGitStore();

  const { t } = useTranslation();

  const repoName = repoInfo
    ? repoInfo.path.split(/[\\/]/).filter(Boolean).pop() || repoInfo.path
    : t('brandTitle');

  const handleQuickAction = (cmd: string) => {
    setCliPreview(cmd);
  };

  return (
    <header
      data-testid="topbar"
      className="h-12 border-b border-slate-800 bg-slate-900/90 backdrop-blur text-slate-100 flex items-center justify-between px-4 select-none shrink-0 z-20"
    >
      {/* Left: Repo brand & current branch badge */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2 text-sm font-semibold tracking-wide text-slate-200 truncate">
          <FolderGit2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{repoName}</span>
        </div>

        {repoInfo && (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium max-w-[140px] truncate">
              {repoInfo.is_detached
                ? t('detachedHead')
                : repoInfo.current_branch || t('noBranch')}
            </span>
          </div>
        )}
      </div>

      {/* Middle: Quick actions, CLI preview & Search */}
      <div className="flex items-center space-x-2">
        {/* Quick actions group */}
        <div className="flex items-center space-x-1 bg-slate-800/80 border border-slate-700/60 rounded-md p-0.5">
          <button
            type="button"
            title={t('topbarFetchTooltip')}
            onClick={() => handleQuickAction('git fetch --all --prune')}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t('topbarPullTooltip')}
            onClick={() => handleQuickAction('git pull --rebase')}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t('topbarPushTooltip')}
            onClick={() => handleQuickAction('git push')}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowUpToLine className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t('topbarNewBranchTooltip')}
            onClick={() => handleQuickAction('git checkout -b <branch>')}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t('topbarStashTooltip')}
            onClick={() => handleQuickAction('git stash')}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* CLI Preview pill */}
        {cliPreview ? (
          <div
            title="CLI command preview"
            className="max-w-[260px] truncate font-mono text-xs px-2 py-1 rounded bg-slate-950 border border-emerald-500/30 text-emerald-400"
          >
            {cliPreview}
          </div>
        ) : null}

        {/* Search bar */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder={t('topbarSearchPlaceholder')}
            className="w-40 focus:w-56 transition-all bg-slate-950/80 border border-slate-700/60 focus:border-emerald-500 rounded-md pl-8 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Right: Terminal drawer toggle, Language toggle and Theme toggle */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          data-testid="terminal-toggle"
          title={t('toggleTerminal')}
          onClick={toggleTerminal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
            isTerminalOpen
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>CLI</span>
        </button>

        <LanguageToggle />

        <button
          type="button"
          data-testid="theme-toggle"
          title={t('toggleTheme')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-sky-400" />
          )}
        </button>
      </div>
    </header>
  );
}

export default TopBar;
