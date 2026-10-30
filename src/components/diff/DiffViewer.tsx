import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Columns2,
  Rows2,
  X,
  FileCode,
  ArrowUpRight,
  RotateCcw,
  Plus,
  Minus,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import {
  parseUnifiedDiff,
  generateHunkPatch,
  type ParsedDiff,
  type DiffHunk,
  type DiffLine,
} from './diffParser';
import { useGitStore } from '../../store/gitStore';

let shikiInstance: HighlighterCore | null = null;
let shikiPromise: Promise<HighlighterCore | null> | null = null;

async function getShiki(): Promise<HighlighterCore | null> {
  if (shikiInstance) return shikiInstance;
  if (!shikiPromise) {
    shikiPromise = createHighlighterCore({
      themes: [
        import('shiki/themes/github-dark.mjs'),
        import('shiki/themes/github-light.mjs'),
      ],
      langs: [
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
      ],
      engine: createJavaScriptRegexEngine(),
    })
      .then((h) => {
        shikiInstance = h;
        return h;
      })
      .catch(() => null);
  }
  return shikiPromise;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'rs':
      return 'rust';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'md':
      return 'markdown';
    default:
      return 'typescript';
  }
}

export interface DiffViewerProps {
  diff?: string;
  parsedDiff?: ParsedDiff;
  filePath?: string;
  isStaged?: boolean;
  onStageHunk?: (hunkIndex: number, patch: string) => void | Promise<void>;
  onRevertHunk?: (hunkIndex: number, patch: string) => void | Promise<void>;
  onClose?: () => void;
  viewMode?: 'unified' | 'split';
  className?: string;
}

interface SplitLinePair {
  type: 'line';
  hunkIndex: number;
  left: DiffLine | null;
  right: DiffLine | null;
}

interface SplitHunkHeader {
  type: 'hunk-header';
  hunkIndex: number;
  hunk: DiffHunk;
}

type SplitRow = SplitHunkHeader | SplitLinePair;

type UnifiedRow =
  | { type: 'hunk-header'; hunkIndex: number; hunk: DiffHunk }
  | { type: 'line'; hunkIndex: number; line: DiffLine };

function highlightCodeRegex(code: string): React.ReactNode {
  if (!code) return ' ';

  const tokenRegex =
    /(\/\/.*$|#[^!].*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|import|export|from|class|interface|type|if|else|for|while|switch|case|default|async|await|fn|pub|struct|impl|match|def|None|True|False)\b)|(\b\d+(?:\.\d+)?\b)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      elements.push(code.slice(lastIndex, match.index));
    }
    const [full, comment, str, kw, num] = match;
    if (comment) {
      elements.push(
        <span key={match.index} className="text-slate-500 italic">
          {comment}
        </span>
      );
    } else if (str) {
      elements.push(
        <span key={match.index} className="text-amber-300">
          {str}
        </span>
      );
    } else if (kw) {
      elements.push(
        <span key={match.index} className="text-purple-400 font-semibold">
          {kw}
        </span>
      );
    } else if (num) {
      elements.push(
        <span key={match.index} className="text-emerald-400">
          {num}
        </span>
      );
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    elements.push(code.slice(lastIndex));
  }
  return elements.length > 0 ? elements : code;
}

function highlightCode(
  code: string,
  lang: string,
  theme: 'dark' | 'light'
): React.ReactNode {
  if (!code) return ' ';

  if (shikiInstance) {
    try {
      const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';
      const loadedLangs = shikiInstance.getLoadedLanguages();
      if (loadedLangs.includes(lang)) {
        const tokens = shikiInstance.codeToTokensBase(code, {
          lang: lang,
          theme: shikiTheme,
        });
        if (tokens && tokens.length > 0 && tokens[0].length > 0) {
          return tokens[0].map((t, idx) => (
            <span key={idx} style={{ color: t.color }}>
              {t.content}
            </span>
          ));
        }
      }
    } catch {
      // Fallback to regex
    }
  }

  return highlightCodeRegex(code);
}

export function DiffViewer({
  diff,
  parsedDiff: propParsedDiff,
  filePath: propFilePath,
  isStaged = false,
  onStageHunk,
  onRevertHunk,
  onClose,
  viewMode: initialViewMode = 'unified',
  className = '',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>(initialViewMode);
  const theme = useGitStore((s) => s.theme);
  const [, setShikiLoaded] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getShiki().then((instance) => {
      if (active && instance) {
        setShikiLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Parse diff if not pre-parsed
  const parsedFile: ParsedDiff | null = useMemo(() => {
    if (propParsedDiff) return propParsedDiff;
    if (!diff) return null;
    const parsedList = parseUnifiedDiff(diff);
    return parsedList.length > 0 ? parsedList[0] : null;
  }, [diff, propParsedDiff]);

  const filePath =
    propFilePath ||
    (parsedFile ? (parsedFile.newPath !== '/dev/null' ? parsedFile.newPath : parsedFile.oldPath) : '') ||
    'Diff';

  const lang = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  // Calculate statistics (+additions, -deletions)
  const { additions, deletions } = useMemo(() => {
    if (!parsedFile) return { additions: 0, deletions: 0 };
    let add = 0;
    let del = 0;
    for (const hunk of parsedFile.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') add++;
        if (line.type === 'delete') del++;
      }
    }
    return { additions: add, deletions: del };
  }, [parsedFile]);

  // Flatten rows for unified view
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    if (!parsedFile) return [];
    const rows: UnifiedRow[] = [];
    parsedFile.hunks.forEach((hunk, hunkIndex) => {
      rows.push({ type: 'hunk-header', hunkIndex, hunk });
      for (const line of hunk.lines) {
        rows.push({ type: 'line', hunkIndex, line });
      }
    });
    return rows;
  }, [parsedFile]);

  // Flatten rows for split (side-by-side) view
  const splitRows: SplitRow[] = useMemo(() => {
    if (!parsedFile) return [];
    const rows: SplitRow[] = [];

    parsedFile.hunks.forEach((hunk, hunkIndex) => {
      rows.push({ type: 'hunk-header', hunkIndex, hunk });

      let delBuffer: DiffLine[] = [];
      let addBuffer: DiffLine[] = [];

      const flushBuffers = () => {
        const count = Math.max(delBuffer.length, addBuffer.length);
        for (let i = 0; i < count; i++) {
          rows.push({
            type: 'line',
            hunkIndex,
            left: delBuffer[i] ?? null,
            right: addBuffer[i] ?? null,
          });
        }
        delBuffer = [];
        addBuffer = [];
      };

      for (const line of hunk.lines) {
        if (line.type === 'delete') {
          delBuffer.push(line);
        } else if (line.type === 'add') {
          addBuffer.push(line);
        } else {
          flushBuffers();
          rows.push({
            type: 'line',
            hunkIndex,
            left: line,
            right: line,
          });
        }
      }
      flushBuffers();
    });

    return rows;
  }, [parsedFile]);

  const activeRowCount = viewMode === 'unified' ? unifiedRows.length : splitRows.length;
  const isVirtualized = activeRowCount > 100;

  const virtualizer = useVirtualizer({
    count: isVirtualized ? activeRowCount : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
    initialRect: { width: 800, height: 600 },
  });

  const handleStageHunkClick = (hunkIndex: number) => {
    if (!parsedFile) return;
    const patch = generateHunkPatch(parsedFile, hunkIndex);
    useGitStore.getState().setCliPreview(`git apply --cached << 'EOF'\n${patch}EOF`);
    onStageHunk?.(hunkIndex, patch);
  };

  const handleRevertHunkClick = (hunkIndex: number) => {
    if (!parsedFile) return;
    const patch = generateHunkPatch(parsedFile, hunkIndex);
    useGitStore.getState().setCliPreview(`git apply -R << 'EOF'\n${patch}EOF`);
    onRevertHunk?.(hunkIndex, patch);
  };

  if (!parsedFile || parsedFile.hunks.length === 0) {
    return (
      <div
        className={`h-full flex flex-col min-h-0 bg-slate-950 text-slate-400 ${className}`}
      >
        {filePath ? (
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/70 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs font-mono font-semibold text-slate-200 truncate" title={filePath}>
                {filePath}
              </span>
            </div>
            {onClose && (
              <button
                data-testid="close-diff-btn"
                onClick={onClose}
                title="Close Diff"
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : null}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <FileCode className="w-10 h-10 text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-300">No changes detected</p>
          <p className="text-xs text-slate-500 mt-1">
            {filePath ? `No diff available for ${filePath}` : 'Select a modified file to view diff'}
          </p>
          {onClose && !filePath && (
            <button
              data-testid="close-diff-btn"
              onClick={onClose}
              className="mt-4 px-3 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderHunkHeader = (hunk: DiffHunk, hunkIndex: number) => (
    <div
      key={`hunk-${hunkIndex}`}
      className="flex items-center justify-between px-3 py-1 bg-slate-900 border-y border-slate-800 text-xs font-mono text-cyan-400 select-none"
    >
      <span className="truncate">{hunk.header}</span>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {!isStaged && (
          <button
            data-testid={`stage-hunk-${hunkIndex}`}
            onClick={() => handleStageHunkClick(hunkIndex)}
            title="Stage this hunk"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-sans font-medium rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Stage Hunk
          </button>
        )}
        <button
          data-testid={`revert-hunk-${hunkIndex}`}
          onClick={() => handleRevertHunkClick(hunkIndex)}
          title="Revert this hunk"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-sans font-medium rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Revert Hunk
        </button>
      </div>
    </div>
  );

  const renderUnifiedLine = (line: DiffLine, index: number) => {
    let rowClass = 'hover:bg-slate-800/40';
    let prefix = ' ';
    let lineNumColor = 'text-slate-600';

    if (line.type === 'add') {
      rowClass = 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15';
      prefix = '+';
      lineNumColor = 'text-emerald-500/70';
    } else if (line.type === 'delete') {
      rowClass = 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/15';
      prefix = '-';
      lineNumColor = 'text-rose-500/70';
    } else if (line.type === 'header') {
      rowClass = 'text-slate-500 italic';
    }

    return (
      <div
        key={`line-${index}`}
        className={`flex items-stretch font-mono text-[11px] leading-5 select-text ${rowClass}`}
      >
        {/* Old Line Number */}
        <span
          className={`w-10 px-1 text-right select-none shrink-0 ${lineNumColor} border-r border-slate-800/60`}
        >
          {line.oldLineNumber ?? ''}
        </span>

        {/* New Line Number */}
        <span
          className={`w-10 px-1 text-right select-none shrink-0 ${lineNumColor} border-r border-slate-800/60`}
        >
          {line.newLineNumber ?? ''}
        </span>

        {/* Prefix (+, -, ' ') */}
        <span className="w-5 text-center select-none font-bold shrink-0">{prefix}</span>

        {/* Code Content */}
        <span className="flex-1 px-1 whitespace-pre overflow-x-auto min-w-0">
          {highlightCode(line.content, lang, theme)}
        </span>
      </div>
    );
  };

  const renderSplitLine = (pair: SplitLinePair, index: number) => {
    const left = pair.left;
    const right = pair.right;

    const leftClass =
      left?.type === 'delete'
        ? 'bg-rose-500/10 text-rose-300'
        : left?.type === 'add'
        ? 'bg-emerald-500/10 text-emerald-300'
        : 'text-slate-300';

    const rightClass =
      right?.type === 'add'
        ? 'bg-emerald-500/10 text-emerald-300'
        : right?.type === 'delete'
        ? 'bg-rose-500/10 text-rose-300'
        : 'text-slate-300';

    return (
      <div
        key={`split-${index}`}
        className="flex items-stretch font-mono text-[11px] leading-5 border-b border-slate-900 select-text"
      >
        {/* Left Side (Old) */}
        <div
          className={`w-1/2 flex items-stretch border-r border-slate-800/80 min-w-0 ${leftClass}`}
        >
          <span className="w-10 px-1 text-right select-none shrink-0 text-slate-600 border-r border-slate-800/60">
            {left?.oldLineNumber ?? ''}
          </span>
          <span className="w-4 text-center select-none shrink-0 font-bold">
            {left ? (left.type === 'delete' ? '-' : ' ') : ''}
          </span>
          <span className="flex-1 px-1 whitespace-pre overflow-x-auto min-w-0">
            {left ? highlightCode(left.content, lang, theme) : ' '}
          </span>
        </div>

        {/* Right Side (New) */}
        <div className={`w-1/2 flex items-stretch min-w-0 ${rightClass}`}>
          <span className="w-10 px-1 text-right select-none shrink-0 text-slate-600 border-r border-slate-800/60">
            {right?.newLineNumber ?? ''}
          </span>
          <span className="w-4 text-center select-none shrink-0 font-bold">
            {right ? (right.type === 'add' ? '+' : ' ') : ''}
          </span>
          <span className="flex-1 px-1 whitespace-pre overflow-x-auto min-w-0">
            {right ? highlightCode(right.content, lang, theme) : ' '}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`h-full flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/70 shrink-0">
        {/* File Path & Stats */}
        <div className="flex items-center gap-2 min-w-0 mr-2">
          <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs font-mono font-semibold text-slate-200 truncate" title={filePath}>
            {filePath}
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] shrink-0 ml-1">
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              +{additions}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
              -{deletions}
            </span>
          </div>
        </div>

        {/* Controls: View Mode Toggle & Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5">
            <button
              data-testid="toggle-unified-view"
              onClick={() => setViewMode('unified')}
              title="Unified View"
              className={`p-1 rounded text-xs transition-colors ${
                viewMode === 'unified'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
            <button
              data-testid="toggle-split-view"
              onClick={() => setViewMode('split')}
              title="Split (Side-by-Side) View"
              className={`p-1 rounded text-xs transition-colors ${
                viewMode === 'split'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {onClose && (
            <button
              data-testid="close-diff-btn"
              onClick={onClose}
              title="Close Diff"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Diff Content Body */}
      <div
        ref={parentRef}
        data-testid={viewMode === 'unified' ? 'diff-view-unified' : 'diff-view-split'}
        className="flex-1 min-h-0 overflow-auto bg-slate-950"
      >
        {viewMode === 'unified' ? (
          isVirtualized ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {virtualizer.getVirtualItems().map((vRow) => {
                const row = unifiedRows[vRow.index];
                return (
                  <div
                    key={vRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    {row.type === 'hunk-header'
                      ? renderHunkHeader(row.hunk, row.hunkIndex)
                      : renderUnifiedLine(row.line, vRow.index)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {unifiedRows.map((row, idx) =>
                row.type === 'hunk-header'
                  ? renderHunkHeader(row.hunk, row.hunkIndex)
                  : renderUnifiedLine(row.line, idx)
              )}
            </div>
          )
        ) : isVirtualized ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = splitRows[vRow.index];
              return (
                <div
                  key={vRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {row.type === 'hunk-header'
                    ? renderHunkHeader(row.hunk, row.hunkIndex)
                    : renderSplitLine(row, vRow.index)}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {splitRows.map((row, idx) =>
              row.type === 'hunk-header'
                ? renderHunkHeader(row.hunk, row.hunkIndex)
                : renderSplitLine(row, idx)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DiffViewer;
