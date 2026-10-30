import React from 'react';
import {
  GitBranch,
  GitPullRequest,
  History,
  RotateCcw,
  GitCommit,
  Tag,
  Archive,
  Globe,
  Check,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useGitStore, type ActiveView } from '../../store/gitStore';
import { useTranslation } from '../../i18n/useTranslation';

export function Sidebar() {
  const {
    repoInfo,
    branches,
    tags,
    stashes,
    activeView,
    setActiveView,
  } = useGitStore();

  const { t } = useTranslation();

  const localBranches = branches.filter((b) => !b.is_remote);
  const remoteBranches = branches.filter((b) => b.is_remote);

  const navItems: { id: ActiveView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'history', label: t('navHistory'), icon: History },
    { id: 'rebase', label: t('navRebase'), icon: GitCommit },
    { id: 'pull-requests', label: t('navPullRequests'), icon: GitPullRequest },
    { id: 'undo', label: t('navUndo'), icon: RotateCcw },
  ];

  return (
    <aside className="w-64 h-full bg-slate-900/95 border-r border-slate-800 flex flex-col text-slate-200 select-none overflow-hidden shrink-0">
      {/* Top Section: Repo status banner */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('repoHeader')}
          </span>
          {repoInfo && (
            <span
              className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                repoInfo.is_clean
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/50 text-amber-400 border-amber-800/60'
              }`}
            >
              {repoInfo.is_clean ? (
                <>
                  <ShieldCheck className="w-3 h-3 mr-0.5" />
                  <span>{t('statusClean')}</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 mr-0.5" />
                  <span>{t('statusDirty')}</span>
                </>
              )}
            </span>
          )}
        </div>

        {repoInfo ? (
          <div className="mt-2 flex items-center space-x-2 text-xs text-slate-300">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium truncate">
              {repoInfo.is_detached ? t('detachedHead') : repoInfo.current_branch || 'HEAD'}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">{t('bannerNoRepo')}</p>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="p-2 border-b border-slate-800 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`nav-${item.id}`}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Branches & Git Objects section */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 text-xs">
        {/* Local branches */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            <span>{t('sectionLocalBranches')}</span>
            <span className="text-[10px] text-slate-500">{localBranches.length}</span>
          </div>
          <div className="space-y-0.5">
            {localBranches.length === 0 ? (
              <div className="px-2 py-1 text-slate-500 italic">{t('emptyBranches')}</div>
            ) : (
              localBranches.map((branch) => (
                <div
                  key={branch.name}
                  className={`group flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    branch.is_current
                      ? 'bg-slate-800 text-emerald-400 font-medium'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <GitBranch className="w-3 h-3 text-slate-400 shrink-0 group-hover:text-emerald-400" />
                    <span className="truncate">{branch.name}</span>
                  </div>
                  {branch.is_current && (
                    <span className="flex items-center text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-400 ml-1 shrink-0">
                      <Check className="w-2.5 h-2.5 mr-0.5" />
                      HEAD
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Remote branches */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            <span>{t('sectionRemoteBranches')}</span>
            <span className="text-[10px] text-slate-500">{remoteBranches.length}</span>
          </div>
          <div className="space-y-0.5">
            {remoteBranches.length === 0 ? (
              <div className="px-2 py-1 text-slate-500 italic">{t('emptyBranches')}</div>
            ) : (
              remoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className="flex items-center space-x-2 px-2 py-1 rounded-md text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <Globe className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{branch.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            <span>{t('sectionTags')}</span>
            <span className="text-[10px] text-slate-500">{tags.length}</span>
          </div>
          <div className="space-y-0.5">
            {tags.length === 0 ? (
              <div className="px-2 py-1 text-slate-500 italic">{t('emptyTags')}</div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.name}
                  className="flex items-center space-x-2 px-2 py-1 rounded-md text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <Tag className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{tag.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stashes */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
            <span>{t('sectionStashes')}</span>
            <span className="text-[10px] text-slate-500">{stashes.length}</span>
          </div>
          <div className="space-y-0.5">
            {stashes.length === 0 ? (
              <div className="px-2 py-1 text-slate-500 italic">{t('emptyStashes')}</div>
            ) : (
              stashes.map((stash) => (
                <div
                  key={stash.index}
                  className="flex items-center space-x-2 px-2 py-1 rounded-md text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <Archive className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">stash@{`{${stash.index}}`}: {stash.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
export default Sidebar;
