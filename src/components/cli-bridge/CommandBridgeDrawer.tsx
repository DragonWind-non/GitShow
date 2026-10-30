import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  Copy,
  Check,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  X,
  BookOpen,
} from 'lucide-react';
import { useGitStore } from '../../store/gitStore';
import { useTranslation } from '../../i18n/useTranslation';
import { EmbeddedTerminal } from './EmbeddedTerminal';

export interface CommandBridgeDrawerProps {
  className?: string;
}

interface FlagExplanation {
  token: string;
  description: string;
}

interface CommandExplanation {
  baseCommand: string;
  baseDescription: string;
  flags: FlagExplanation[];
}

const COMMAND_EXPLANATIONS: Record<string, string> = {
  commit: 'Creates a new commit containing staged changes.',
  add: 'Adds file contents to the staging area (index).',
  restore: 'Restores working tree files or unstages changes.',
  status: 'Shows the working tree status and staging area.',
  fetch: 'Downloads objects and refs from another repository.',
  pull: 'Fetches from and integrates with another repository or branch.',
  push: 'Updates remote refs along with associated objects.',
  checkout: 'Switches branches or restores working tree files.',
  switch: 'Switches branches.',
  branch: 'Lists, creates, or deletes branches.',
  merge: 'Joins two or more development histories together.',
  rebase: 'Reapplies commits on top of another base tip.',
  reset: 'Resets current HEAD to the specified state.',
  stash: 'Stashes changes in a dirty working directory away.',
  diff: 'Shows changes between commits, commit and working tree, etc.',
  log: 'Shows commit logs.',
};

const FLAG_EXPLANATIONS: Record<string, string> = {
  '-m': 'Specifies the commit log message inline.',
  '-a': 'Automatically stages files that have been modified and deleted.',
  '-b': 'Creates and checks out a new branch.',
  '--hard': 'Resets index and working tree; any changes to tracked files are discarded.',
  '--soft': 'Leaves all changed files staged in index; only resets HEAD pointer.',
  '--cached': 'Operates on the staging area (index) without modifying working tree.',
  '--staged': 'Operates on the staging area (index) to unstage changes.',
  '-i': 'Enters interactive mode.',
  '-A': 'Stages all changes (new, modified, and deleted files).',
  '--amend': 'Replaces the tip of the current branch instead of creating a new commit.',
  '--force': 'Forces the operation even if it results in a non-fast-forward.',
  '-f': 'Forces the operation even if it results in a non-fast-forward.',
  '-p': 'Interactively chooses hunks of patch to stage or view.',
  '-R': 'Reverses the diff output or operation.',
  stash: 'Saves local modifications away to a stash list.',
  '--short': 'Gives output in short format.',
  '--all': 'Fetches all remotes or operates across all refs.',
  '--prune': 'Removes remote-tracking references that no longer exist on remote.',
  '--rebase': 'Rebases current branch on top of upstream branch after fetching.',
};

export function parseGitExplanation(commandStr: string): CommandExplanation {
  const tokens = commandStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  if (tokens.length === 0) {
    return {
      baseCommand: 'git status',
      baseDescription: COMMAND_EXPLANATIONS['status'] || 'Shows the working tree status and staging area.',
      flags: [],
    };
  }

  let subcmd = 'status';
  let startIndex = 1;

  if (tokens[0] === 'git' && tokens.length > 1) {
    subcmd = tokens[1] || 'status';
    startIndex = 2;
  } else if (tokens[0] === 'git') {
    subcmd = 'status';
    startIndex = 1;
  } else {
    subcmd = tokens[0] || 'status';
    startIndex = 1;
  }

  const baseCommand = `git ${subcmd}`;
  const baseDescription = COMMAND_EXPLANATIONS[subcmd] || 'Executes git operation.';

  const flags: FlagExplanation[] = [];
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (FLAG_EXPLANATIONS[token]) {
      // Check if this flag takes a parameter (like -m or -b)
      const nextToken = tokens[i + 1];
      if ((token === '-m' || token === '-b') && nextToken) {
        flags.push({
          token: `${token} ${nextToken}`,
          description: FLAG_EXPLANATIONS[token] || '',
        });
        i++; // skip parameter
      } else {
        flags.push({
          token,
          description: FLAG_EXPLANATIONS[token] || '',
        });
      }
    } else if (token.startsWith('-')) {
      flags.push({
        token,
        description: 'Option flag controlling command behavior.',
      });
    } else if (token.startsWith('"') || token.startsWith("'") || token.includes('/') || token.includes('\\')) {
      flags.push({
        token,
        description: 'Target path or string argument.',
      });
    } else if (token !== '.') {
      flags.push({
        token,
        description: 'Command argument or reference.',
      });
    }
  }

  return { baseCommand, baseDescription, flags };
}

export function CommandBridgeDrawer({ className = '' }: CommandBridgeDrawerProps) {
  const cliPreview = useGitStore((state) => state.cliPreview);
  const isTerminalOpen = useGitStore((state) => state.isTerminalOpen);
  const toggleTerminal = useGitStore((state) => state.toggleTerminal);
  const { t } = useTranslation();

  const [copied, setCopied] = useState(false);
  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const displayCommand = cliPreview.trim() || 'git status';
  const explanation = parseGitExplanation(displayCommand);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write fallback
    }
  };

  const renderHighlightedCommand = (cmd: string) => {
    const tokens = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [cmd];
    return tokens.map((token, idx) => {
      let colorClass = 'text-slate-300';
      if (idx === 0 && token === 'git') {
        colorClass = 'text-emerald-400 font-semibold';
      } else if (idx === 1 && !token.startsWith('-')) {
        colorClass = 'text-sky-300 font-medium';
      } else if (token.startsWith('-')) {
        colorClass = 'text-amber-300';
      } else if (token.startsWith('"') || token.startsWith("'")) {
        colorClass = 'text-emerald-200';
      }
      return (
        <span key={idx} className={`${colorClass} mr-1.5`}>
          {token}{' '}
        </span>
      );
    });
  };

  return (
    <div
      data-testid="cli-bridge-drawer"
      className={`relative w-full flex flex-col bg-slate-950 border-t border-slate-800 select-none ${className}`}
    >
      {/* Realtime CLI Bar (40px) */}
      <div className="h-10 px-3 flex items-center justify-between gap-3 text-xs font-mono shrink-0 bg-slate-900/90 border-b border-slate-800/80">
        {/* Left: Prompt icon & Command text */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1 text-emerald-400 shrink-0">
            <TerminalIcon className="w-3.5 h-3.5" />
            <span className="font-bold select-none">$</span>
          </div>

          <div
            data-testid="cli-command-text"
            className="truncate text-xs font-mono py-0.5"
            title={displayCommand}
          >
            {renderHighlightedCommand(displayCommand)}
          </div>
        </div>

        {/* Right: Actions (Copy, Explain, Terminal Toggle) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="cli-copy-btn"
            onClick={handleCopy}
            title="Copy command to clipboard"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] text-emerald-400 font-sans">{t('cliCopied')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[11px] font-sans">{t('cliCopyBtn')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="cli-explain-btn"
            onClick={() => setIsExplainOpen(!isExplainOpen)}
            title="Explain git command and flags"
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              isExplainOpen
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3 h-3 text-blue-400" />
            <span className="text-[11px] font-sans">{t('cliExplainFlags')}</span>
          </button>

          <button
            type="button"
            data-testid="cli-terminal-toggle-btn"
            onClick={toggleTerminal}
            title={isTerminalOpen ? 'Collapse Terminal Drawer' : 'Expand Terminal Drawer'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              isTerminalOpen
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <TerminalIcon className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] font-sans">Terminal</span>
            {isTerminalOpen ? (
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
            ) : (
              <ChevronUp className="w-3 h-3 ml-0.5 opacity-70" />
            )}
          </button>
        </div>
      </div>

      {/* Explain Popover */}
      {isExplainOpen && (
        <div
          data-testid="cli-explain-popover"
          className="absolute bottom-11 right-3 z-50 w-96 max-w-[90vw] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3.5 text-xs font-sans text-slate-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              Command Breakdown
            </span>
            <button
              type="button"
              onClick={() => setIsExplainOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="font-mono text-emerald-400 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 mb-3 text-[11px] truncate">
            {displayCommand}
          </div>

          <div className="space-y-2">
            <div>
              <div className="font-semibold font-mono text-sky-300 text-[11px]">
                {explanation.baseCommand}
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                {explanation.baseDescription}
              </div>
            </div>

            {explanation.flags.map((flag, idx) => (
              <div key={idx} className="pt-1.5 border-t border-slate-800/60">
                <div className="font-mono text-amber-300 font-medium text-[11px]">
                  {flag.token}
                </div>
                <div className="text-slate-400 text-[11px] mt-0.5">
                  {flag.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded Embedded Terminal Drawer */}
      {isTerminalOpen && (
        <div className="h-56 w-full min-h-0 bg-slate-950 overflow-hidden">
          <EmbeddedTerminal />
        </div>
      )}
    </div>
  );
}

export default CommandBridgeDrawer;
