import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitCommit, GitMerge, GitPullRequest, ArrowRight, CornerDownRight } from 'lucide-react';
import { useGitStore } from '../../store/gitStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { DagCommit } from '../../types/git';
import {
  ROW_HEIGHT,
  getVisibleRange,
  hitTestCommit,
  renderDag,
} from './dagRenderer';

interface ContextMenuState {
  x: number;
  y: number;
  commit: DagCommit;
}

export function DagCanvas() {
  const commits = useGitStore((state) => state.commits);
  const selectedCommit = useGitStore((state) => state.selectedCommit);
  const theme = useGitStore((state) => state.theme);
  const selectCommit = useGitStore((state) => state.selectCommit);
  const setCliPreview = useGitStore((state) => state.setCliPreview);
  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const justDroppedRef = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedCommit, setDraggedCommit] = useState<DagCommit | null>(null);

  // Core render routine
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = container.clientWidth || dimensions.width || 800;
    const height = container.clientHeight || dimensions.height || 600;

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const scrollTop = container.scrollTop;
    const { startIndex, endIndex } = getVisibleRange(scrollTop, height, commits.length);

    renderDag(
      ctx,
      commits,
      startIndex,
      endIndex,
      selectedCommit?.id ?? null,
      theme,
      dpr,
      scrollTop,
      width,
      height
    );
  }, [commits, selectedCommit, theme, dimensions]);

  // Request animation frame debounce for 60fps scrolling
  const scheduleRender = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = null;
      render();
    });
  }, [render]);

  // Handle ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Re-render when commits, dimensions, selection, or theme change
  useEffect(() => {
    scheduleRender();
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [scheduleRender, dimensions]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const handleClickOutside = () => setContextMenu(null);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Handle mouse click on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (justDroppedRef.current) {
      justDroppedRef.current = false;
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const commit = hitTestCommit(x, y, container.scrollTop, commits);

    selectCommit(commit);
    if (commit) {
      const shortId = commit.short_id || commit.id.slice(0, 7);
      setCliPreview(`git show ${shortId}`);
    }
  };

  // Handle context menu (right-click)
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const commit = hitTestCommit(x, y, container.scrollTop, commits);

    if (commit) {
      selectCommit(commit);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        commit,
      });
    } else {
      setContextMenu(null);
    }
  };

  // Drag-and-drop branch merge handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const commit = hitTestCommit(x, y, container.scrollTop, commits);

    if (commit) {
      setDraggedCommit(commit);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedCommit) {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const targetCommit = hitTestCommit(x, y, container.scrollTop, commits);

        if (targetCommit && targetCommit.id !== draggedCommit.id) {
          justDroppedRef.current = true;
          const dragShort = draggedCommit.short_id || draggedCommit.id.slice(0, 7);
          setCliPreview(`git merge ${dragShort}`);
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            commit: targetCommit,
          });
        }
      }
      setDraggedCommit(null);
    }
  };

  const totalHeight = Math.max(commits.length * ROW_HEIGHT, dimensions.height);

  return (
    <div
      data-testid="dag-canvas-container"
      ref={containerRef}
      onScroll={scheduleRender}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden select-none bg-slate-950 dark:bg-slate-950"
    >
      {commits.length === 0 ? (
        <div
          data-testid="dag-empty"
          className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2"
        >
          <GitCommit className="w-8 h-8 opacity-40 animate-pulse" />
          <p>{t('dagEmpty')}</p>
        </div>
      ) : (
        <>
          {/* Scroll spacer that gives the container full virtual scroll height */}
          <div
            data-testid="dag-scroll-spacer"
            style={{ height: totalHeight, width: '1px', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          />

          {/* Sticky canvas pinned to viewport */}
          <canvas
            data-testid="dag-canvas-element"
            ref={canvasRef}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            className="sticky top-0 left-0 pointer-events-auto cursor-pointer block"
          />
        </>
      )}

      {/* Context Menu Popup for Branch/Merge Operations */}
      {contextMenu && (
        <div
          data-testid="dag-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-52 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-xs text-slate-200 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400">
            {t('menuCommitPrefix')} {contextMenu.commit.short_id || contextMenu.commit.id.slice(0, 7)}
          </div>

          <button
            data-testid="menu-checkout"
            onClick={() => {
              const short = contextMenu.commit.short_id || contextMenu.commit.id.slice(0, 7);
              setCliPreview(`git checkout ${short}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-blue-600/20 hover:text-blue-400 flex items-center gap-2"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{t('menuCheckout')}</span>
          </button>

          <button
            data-testid="menu-merge"
            onClick={() => {
              const short = contextMenu.commit.short_id || contextMenu.commit.id.slice(0, 7);
              setCliPreview(`git merge ${short}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-emerald-600/20 hover:text-emerald-400 flex items-center gap-2"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>{t('menuMerge')}</span>
          </button>

          <button
            data-testid="menu-rebase"
            onClick={() => {
              const short = contextMenu.commit.short_id || contextMenu.commit.id.slice(0, 7);
              setCliPreview(`git rebase ${short}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-purple-600/20 hover:text-purple-400 flex items-center gap-2"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
            <span>{t('menuRebase')}</span>
          </button>

          <button
            data-testid="menu-cherry-pick"
            onClick={() => {
              const short = contextMenu.commit.short_id || contextMenu.commit.id.slice(0, 7);
              setCliPreview(`git cherry-pick ${short}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-amber-600/20 hover:text-amber-400 flex items-center gap-2"
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>{t('menuCherryPick')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default DagCanvas;
