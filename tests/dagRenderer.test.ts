import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  ROW_HEIGHT,
  LANE_WIDTH,
  NODE_RADIUS,
  START_X,
  LANE_COLORS,
  getLaneColor,
  getVisibleRange,
  hitTestCommit,
  renderDag,
} from '../src/components/graph/dagRenderer';
import { DagCanvas } from '../src/components/graph/DagCanvas';
import { useGitStore } from '../src/store/gitStore';
import type { DagCommit } from '../src/types/git';

describe('dagRenderer - Layout Constants & Lane Colors', () => {
  it('defines standard layout dimensions', () => {
    expect(ROW_HEIGHT).toBe(40);
    expect(LANE_WIDTH).toBe(20);
    expect(NODE_RADIUS).toBe(5);
    expect(START_X).toBe(30);
  });

  it('provides distinct color palette and distributes lanes correctly with wrap-around', () => {
    expect(LANE_COLORS.length).toBeGreaterThanOrEqual(8);
    // Unique colors in palette
    const uniqueColors = new Set(LANE_COLORS);
    expect(uniqueColors.size).toBe(LANE_COLORS.length);

    // Distribution
    expect(getLaneColor(0)).toBe(LANE_COLORS[0]);
    expect(getLaneColor(1)).toBe(LANE_COLORS[1]);
    expect(getLaneColor(7)).toBe(LANE_COLORS[7]);
    // Wraps around when lane >= LANE_COLORS.length
    expect(getLaneColor(8)).toBe(LANE_COLORS[0]);
    expect(getLaneColor(9)).toBe(LANE_COLORS[1]);
  });
});

describe('dagRenderer - getVisibleRange', () => {
  it('calculates visible range at top (scrollTop = 0, containerHeight = 400)', () => {
    // 400 / 40 = 10 visible rows (0 to 10), buffer = 5 -> start: 0, end: 15
    const range = getVisibleRange(0, 400, 100);
    expect(range).toEqual({ startIndex: 0, endIndex: 15 });
  });

  it('calculates visible range when scrolled down (scrollTop = 800, containerHeight = 400)', () => {
    // 800 / 40 = row 20. (800+400)/40 = row 30. buffer = 5 -> start: 15, end: 35
    const range = getVisibleRange(800, 400, 100);
    expect(range).toEqual({ startIndex: 15, endIndex: 35 });
  });

  it('handles empty commit history (totalCount = 0)', () => {
    const range = getVisibleRange(0, 400, 0);
    expect(range).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('clamps endIndex to totalCount when scrolling near bottom', () => {
    // Total 30 commits, row 20 to 30 visible + buffer 5 would be 35, clamped to 30
    const range = getVisibleRange(800, 400, 30);
    expect(range.startIndex).toBe(15);
    expect(range.endIndex).toBe(30);
  });

  it('handles zero or negative containerHeight gracefully', () => {
    expect(getVisibleRange(0, 0, 100)).toEqual({ startIndex: 0, endIndex: 0 });
    expect(getVisibleRange(0, -100, 100)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

describe('dagRenderer - hitTestCommit', () => {
  const mockCommits: DagCommit[] = [
    {
      id: 'commit-0',
      short_id: 'c0c0c00',
      summary: 'feat: initial commit',
      author_name: 'Alice',
      author_email: 'alice@example.com',
      timestamp: 1700000000,
      parent_ids: [],
      lane: 0,
      branch_names: ['main'],
      is_head: false,
    },
    {
      id: 'commit-1',
      short_id: 'c1c1c11',
      summary: 'feat: add feature branch',
      author_name: 'Bob',
      author_email: 'bob@example.com',
      timestamp: 1700001000,
      parent_ids: ['commit-0'],
      lane: 1,
      branch_names: ['feature'],
      is_head: true,
    },
    {
      id: 'commit-2',
      short_id: 'c2c2c22',
      summary: 'fix: resolve edge case',
      author_name: 'Charlie',
      author_email: 'charlie@example.com',
      timestamp: 1700002000,
      parent_ids: ['commit-1'],
      lane: 1,
      branch_names: [],
      is_head: false,
    },
  ];

  it('returns commit-0 when clicking inside first row (y = 20, scrollTop = 0)', () => {
    const commit = hitTestCommit(50, 20, 0, mockCommits);
    expect(commit).not.toBeNull();
    expect(commit?.id).toBe('commit-0');
  });

  it('returns commit-1 when clicking inside second row (y = 55, scrollTop = 0)', () => {
    const commit = hitTestCommit(50, 55, 0, mockCommits);
    expect(commit).not.toBeNull();
    expect(commit?.id).toBe('commit-1');
  });

  it('returns correct commit taking scrollTop into account (y = 15, scrollTop = 80 -> row 2)', () => {
    // 15 + 80 = 95 -> Math.floor(95 / 40) = 2 -> commit-2
    const commit = hitTestCommit(50, 15, 80, mockCommits);
    expect(commit).not.toBeNull();
    expect(commit?.id).toBe('commit-2');
  });

  it('returns null when clicking beyond total rows (y = 200, scrollTop = 0, count = 3)', () => {
    // 200 / 40 = 5 >= 3 commits
    const commit = hitTestCommit(50, 200, 0, mockCommits);
    expect(commit).toBeNull();
  });

  it('returns null for negative coordinates', () => {
    expect(hitTestCommit(-10, 20, 0, mockCommits)).toBeNull();
    expect(hitTestCommit(50, -5, 0, mockCommits)).toBeNull();
  });
});

describe('dagRenderer - renderDag execution', () => {
  it('executes canvas drawing routines without throwing', () => {
    const mockCommits: DagCommit[] = [
      {
        id: 'c-0',
        short_id: 'c000000',
        summary: 'Root commit',
        author_name: 'Dev',
        author_email: 'dev@test.com',
        timestamp: 1700000000,
        parent_ids: [],
        lane: 0,
        branch_names: ['main'],
        is_head: false,
      },
      {
        id: 'c-1',
        short_id: 'c111111',
        summary: 'Merge branch feature',
        author_name: 'Dev',
        author_email: 'dev@test.com',
        timestamp: 1700001000,
        parent_ids: ['c-0'],
        lane: 1,
        branch_names: ['feature'],
        is_head: true,
      },
    ];

    const ctx = {
      canvas: { width: 800, height: 600 },
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'alphabetic',
    } as unknown as CanvasRenderingContext2D;

    // Call renderDag in dark theme
    renderDag(ctx, mockCommits, 0, 2, 'c-1', 'dark', 2, 0, 800, 600);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();

    // Call renderDag in light theme
    renderDag(ctx, mockCommits, 0, 2, null, 'light', 1, 0, 800, 600);
    expect(ctx.save).toHaveBeenCalledTimes(4);
    expect(ctx.restore).toHaveBeenCalledTimes(4);
  });
});

describe('DagCanvas Component', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }

    act(() => {
      useGitStore.setState({
        commits: [],
        selectedCommit: null,
        theme: 'dark',
        cliPreview: '',
      });
    });
  });

  it('renders empty state when there are no commits', () => {
    render(React.createElement(DagCanvas));
    expect(screen.getByTestId('dag-empty')).toBeDefined();
    expect(screen.getByText(/No commits found/i)).toBeDefined();
  });

  it('renders virtual scroll container and canvas when commits are loaded', () => {
    const mockCommits: DagCommit[] = [
      {
        id: 'aaa111',
        short_id: 'aaa111',
        summary: 'Commit A',
        author_name: 'Author',
        author_email: 'a@test.com',
        timestamp: 1700000000,
        parent_ids: [],
        lane: 0,
        branch_names: ['main'],
        is_head: true,
      },
      {
        id: 'bbb222',
        short_id: 'bbb222',
        summary: 'Commit B',
        author_name: 'Author',
        author_email: 'a@test.com',
        timestamp: 1700001000,
        parent_ids: ['aaa111'],
        lane: 0,
        branch_names: [],
        is_head: false,
      },
    ];

    act(() => {
      useGitStore.getState().setCommits(mockCommits);
    });

    render(React.createElement(DagCanvas));

    expect(screen.getByTestId('dag-canvas-container')).toBeDefined();
    expect(screen.getByTestId('dag-scroll-spacer')).toBeDefined();
    expect(screen.getByTestId('dag-canvas-element')).toBeDefined();
  });

  it('handles canvas click to select commit and update cliPreview', () => {
    const mockCommit: DagCommit = {
      id: 'ccc333',
      short_id: 'ccc333',
      summary: 'Commit C',
      author_name: 'Dev',
      author_email: 'd@test.com',
      timestamp: 1700000000,
      parent_ids: [],
      lane: 0,
      branch_names: ['main'],
      is_head: true,
    };

    act(() => {
      useGitStore.getState().setCommits([mockCommit]);
    });

    render(React.createElement(DagCanvas));

    const canvas = screen.getByTestId('dag-canvas-element');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Click inside first row (y = 20)
    fireEvent.click(canvas, { clientX: 50, clientY: 20 });

    expect(useGitStore.getState().selectedCommit?.id).toBe('ccc333');
    expect(useGitStore.getState().cliPreview).toBe('git show ccc333');
  });

  it('opens context menu on right click and triggers actions', () => {
    const mockCommit: DagCommit = {
      id: 'ddd444',
      short_id: 'ddd444',
      summary: 'Commit D',
      author_name: 'Dev',
      author_email: 'd@test.com',
      timestamp: 1700000000,
      parent_ids: [],
      lane: 0,
      branch_names: ['feature'],
      is_head: false,
    };

    act(() => {
      useGitStore.getState().setCommits([mockCommit]);
    });

    render(React.createElement(DagCanvas));

    const canvas = screen.getByTestId('dag-canvas-element');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Right-click inside row (y = 20)
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 20 });

    expect(screen.getByTestId('dag-context-menu')).toBeDefined();
    expect(screen.getByTestId('menu-checkout')).toBeDefined();
    expect(screen.getByTestId('menu-merge')).toBeDefined();
    expect(screen.getByTestId('menu-rebase')).toBeDefined();

    // Click checkout action
    fireEvent.click(screen.getByTestId('menu-checkout'));
    expect(useGitStore.getState().cliPreview).toBe('git checkout ddd444');
    expect(screen.queryByTestId('dag-context-menu')).toBeNull();
  });
});
