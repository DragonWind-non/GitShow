import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Search, X, GitCommit, Check } from 'lucide-react';
import { FileItem } from './FileItem';
import { useGitStore } from '../../store/gitStore';
import type { FileStatus } from '../../types/git';

export interface StagingPanelProps {
  stagedFiles?: FileStatus[];
  unstagedFiles?: FileStatus[];
  selectedFile?: FileStatus | null;
  onSelectFile?: (file: FileStatus) => void;
  onStage?: (file: FileStatus) => void | Promise<void>;
  onUnstage?: (file: FileStatus) => void | Promise<void>;
  onStageAll?: () => void | Promise<void>;
  onUnstageAll?: () => void | Promise<void>;
  onDiscard?: (file: FileStatus) => void | Promise<void>;
  onCommit?: (message: string, isAmend: boolean) => void | Promise<void>;
}

const CONVENTIONAL_TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor'] as const;

export function formatCommitPreview(message: string, isAmend: boolean): string {
  const amendFlag = isAmend ? ' --amend' : '';
  if (!message) {
    return isAmend ? 'git commit --amend' : 'git commit';
  }
  return `git commit${amendFlag} -m "${message}"`;
}

function applyConventionalType(type: string, currentMessage: string): string {
  const match = currentMessage.match(/^[a-z]+(\([a-z0-9_-]+\))?:\s*/i);
  if (match) {
    return `${type}: ${currentMessage.slice(match[0].length)}`;
  }
  if (!currentMessage) {
    return `${type}: `;
  }
  return `${type}: ${currentMessage}`;
}

export function StagingPanel({
  stagedFiles: propStagedFiles,
  unstagedFiles: propUnstagedFiles,
  selectedFile,
  onSelectFile,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onDiscard,
  onCommit,
}: StagingPanelProps) {
  // Synchronize store on initial mount if props were passed
  const isFirstMount = useRef(true);
  if (isFirstMount.current && (propStagedFiles !== undefined || propUnstagedFiles !== undefined)) {
    useGitStore.setState({
      stagedFiles: propStagedFiles ?? [],
      unstagedFiles: propUnstagedFiles ?? [],
    });
    isFirstMount.current = false;
  }

  const prevPropsRef = useRef({ staged: propStagedFiles, unstaged: propUnstagedFiles });
  useEffect(() => {
    if (
      propStagedFiles !== prevPropsRef.current.staged ||
      propUnstagedFiles !== prevPropsRef.current.unstaged
    ) {
      prevPropsRef.current = { staged: propStagedFiles, unstaged: propUnstagedFiles };
      if (propStagedFiles !== undefined || propUnstagedFiles !== undefined) {
        useGitStore.getState().setFiles(
          propStagedFiles ?? useGitStore.getState().stagedFiles,
          propUnstagedFiles ?? useGitStore.getState().unstagedFiles
        );
      }
    }
  }, [propStagedFiles, propUnstagedFiles]);

  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);

  const [filterQuery, setFilterQuery] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isAmend, setIsAmend] = useState(false);

  const filteredStaged = stagedFiles.filter((f) =>
    f.path.toLowerCase().includes(filterQuery.toLowerCase())
  );
  const filteredUnstaged = unstagedFiles.filter((f) =>
    f.path.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleStageAll = async () => {
    const allStaged = [
      ...stagedFiles,
      ...unstagedFiles.map((f) => ({ ...f, staged: true })),
    ];
    useGitStore.getState().setFiles(allStaged, []);
    useGitStore.getState().setCliPreview('git add -A');
    if (onStageAll) {
      await onStageAll();
    }
  };

  const handleUnstageAll = async () => {
    const allUnstaged = [
      ...unstagedFiles,
      ...stagedFiles.map((f) => ({ ...f, staged: false })),
    ];
    useGitStore.getState().setFiles([], allUnstaged);
    useGitStore.getState().setCliPreview('git restore --staged .');
    if (onUnstageAll) {
      await onUnstageAll();
    }
  };

  const handleStage = async (file: FileStatus) => {
    const nextUnstaged = unstagedFiles.filter((f) => f.path !== file.path);
    const nextStaged = [
      ...stagedFiles.filter((f) => f.path !== file.path),
      { ...file, staged: true },
    ];
    useGitStore.getState().setFiles(nextStaged, nextUnstaged);
    useGitStore.getState().setCliPreview(`git add "${file.path}"`);
    if (onStage) {
      await onStage(file);
    }
  };

  const handleUnstage = async (file: FileStatus) => {
    const nextStaged = stagedFiles.filter((f) => f.path !== file.path);
    const nextUnstaged = [
      ...unstagedFiles.filter((f) => f.path !== file.path),
      { ...file, staged: false },
    ];
    useGitStore.getState().setFiles(nextStaged, nextUnstaged);
    useGitStore.getState().setCliPreview(`git restore --staged "${file.path}"`);
    if (onUnstage) {
      await onUnstage(file);
    }
  };

  const handleDiscard = async (file: FileStatus) => {
    const nextUnstaged = unstagedFiles.filter((f) => f.path !== file.path);
    useGitStore.getState().setFiles(stagedFiles, nextUnstaged);
    useGitStore.getState().setCliPreview(`git restore "${file.path}"`);
    if (onDiscard) {
      await onDiscard(file);
    }
  };

  const handleCommitMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextMessage = e.target.value;
    setCommitMessage(nextMessage);
    useGitStore.getState().setCliPreview(formatCommitPreview(nextMessage, isAmend));
  };

  const handleToggleAmend = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextAmend = e.target.checked;
    setIsAmend(nextAmend);
    useGitStore.getState().setCliPreview(formatCommitPreview(commitMessage, nextAmend));
  };

  const handlePillClick = (type: string) => {
    const nextMessage = applyConventionalType(type, commitMessage);
    setCommitMessage(nextMessage);
    useGitStore.getState().setCliPreview(formatCommitPreview(nextMessage, isAmend));
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    const msg = commitMessage;
    const amend = isAmend;
    setCommitMessage('');
    useGitStore.getState().setCliPreview('');
    if (onCommit) {
      void onCommit(msg, amend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-900/60 overflow-hidden text-slate-200">
      {/* Top Header & Search */}
      <div className="p-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-blue-400" />
            Staging Area
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            {stagedFiles.length + unstagedFiles.length} files
          </span>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* File Lists (Scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-4">
        {/* Staged Changes Section */}
        <div>
          <div className="flex items-center justify-between py-1 px-1 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <span>Staged Changes</span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {stagedFiles.length}
              </span>
            </span>
            <button
              data-testid="unstage-all-btn"
              onClick={handleUnstageAll}
              disabled={stagedFiles.length === 0}
              title="Unstage all changes"
              className="flex items-center gap-1 text-[11px] font-normal text-slate-400 hover:text-amber-300 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
            >
              <Minus className="w-3 h-3" />
              Unstage All
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {filteredStaged.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic py-1 px-2">
                No staged changes
              </div>
            ) : (
              filteredStaged.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  isSelected={selectedFile?.path === file.path}
                  onSelect={onSelectFile}
                  onUnstage={handleUnstage}
                />
              ))
            )}
          </div>
        </div>

        {/* Changes (Unstaged) Section */}
        <div>
          <div className="flex items-center justify-between py-1 px-1 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <span>Changes</span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {unstagedFiles.length}
              </span>
            </span>
            <button
              data-testid="stage-all-btn"
              onClick={handleStageAll}
              disabled={unstagedFiles.length === 0}
              title="Stage all changes"
              className="flex items-center gap-1 text-[11px] font-normal text-slate-400 hover:text-emerald-300 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Stage All
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {filteredUnstaged.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic py-1 px-2">
                No unstaged changes
              </div>
            ) : (
              filteredUnstaged.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  isSelected={selectedFile?.path === file.path}
                  onSelect={onSelectFile}
                  onStage={handleStage}
                  onDiscard={handleDiscard}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Commit Box Section */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 shrink-0 flex flex-col gap-2.5">
        {/* Conventional Commits Helper Pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Prefix:</span>
          {CONVENTIONAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handlePillClick(type)}
              className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700 hover:text-white transition-colors"
            >
              {type}
            </button>
          ))}
        </div>

        {/* Commit Message Textarea */}
        <textarea
          rows={3}
          placeholder="Commit message (summary and optional description)..."
          value={commitMessage}
          onChange={handleCommitMessageChange}
          onKeyDown={handleKeyDown}
          className="w-full p-2 text-xs font-mono bg-slate-900 border border-slate-800 rounded resize-none text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
        />

        {/* Amend checkbox & Commit button */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 select-none cursor-pointer hover:text-slate-300">
            <input
              type="checkbox"
              checked={isAmend}
              onChange={handleToggleAmend}
              className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>Amend previous commit</span>
          </label>

          <button
            data-testid="commit-btn"
            type="button"
            onClick={handleCommit}
            disabled={!commitMessage.trim()}
            title="Commit changes (Ctrl+Enter)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Commit</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default StagingPanel;
