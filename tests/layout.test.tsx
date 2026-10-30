import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AppLayout } from '../src/components/layout/AppLayout';
import { TopBar } from '../src/components/layout/TopBar';
import { Sidebar } from '../src/components/layout/Sidebar';
import { useGitStore } from '../src/store/gitStore';
import type { BranchInfo, RepoInfo, DagCommit } from '../src/types/git';

describe('Task 11: 3-Column Studio Layout & Zustand App State', () => {
  beforeEach(() => {
    // Reset store to default state
    act(() => {
      useGitStore.setState({
        repoInfo: null,
        branches: [],
        tags: [],
        commits: [],
        selectedCommit: null,
        stagedFiles: [],
        unstagedFiles: [],
        cliPreview: '',
        isTerminalOpen: false,
        theme: 'dark',
        activeView: 'history',
      });
    });
    document.documentElement.className = '';
  });

  it('renders 3 columns (sidebar, center stage, right panel) and bottom drawer in AppLayout', () => {
    render(
      <AppLayout
        center={<div data-testid="dag-canvas-placeholder">DAG Canvas</div>}
        right={<div data-testid="inspector-placeholder">Inspector Details</div>}
        bottom={<div data-testid="terminal-placeholder">Embedded Terminal</div>}
      />
    );

    expect(screen.getByTestId('sidebar-column')).toBeDefined();
    expect(screen.getByTestId('center-column')).toBeDefined();
    expect(screen.getByTestId('right-column')).toBeDefined();
    expect(screen.getByTestId('bottom-drawer')).toBeDefined();
    expect(screen.getByTestId('dag-canvas-placeholder')).toBeDefined();
    expect(screen.getByTestId('inspector-placeholder')).toBeDefined();
  });

  it('updates Zustand useGitStore state correctly with actions', () => {
    const mockRepo: RepoInfo = {
      path: '/path/to/my-repo',
      current_branch: 'feature/studio-ui',
      is_detached: false,
      is_clean: false,
    };

    const mockBranches: BranchInfo[] = [
      { name: 'main', is_current: false, is_remote: false, target_commit: 'abc1234' },
      { name: 'feature/studio-ui', is_current: true, is_remote: false, target_commit: 'def5678' },
      { name: 'origin/main', is_current: false, is_remote: true, target_commit: 'abc1234' },
    ];

    const mockCommit: DagCommit = {
      id: 'def56781234567890abcdef',
      short_id: 'def5678',
      summary: 'feat(ui): implement studio layout',
      author_name: 'Dev',
      author_email: 'dev@example.com',
      timestamp: 1700000000,
      parent_ids: ['abc1234'],
      lane: 0,
      branch_names: ['feature/studio-ui'],
      is_head: true,
    };

    act(() => {
      useGitStore.getState().setRepoInfo(mockRepo);
      useGitStore.getState().setBranches(mockBranches);
      useGitStore.getState().selectCommit(mockCommit);
      useGitStore.getState().setCliPreview('git status --short');
      useGitStore.getState().setActiveView('pull-requests');
    });

    const state = useGitStore.getState();
    expect(state.repoInfo?.path).toBe('/path/to/my-repo');
    expect(state.repoInfo?.current_branch).toBe('feature/studio-ui');
    expect(state.branches.length).toBe(3);
    expect(state.selectedCommit?.short_id).toBe('def5678');
    expect(state.cliPreview).toBe('git status --short');
    expect(state.activeView).toBe('pull-requests');
  });

  it('toggles terminal drawer state and reflects in bottom drawer visibility', () => {
    render(<AppLayout />);

    expect(useGitStore.getState().isTerminalOpen).toBe(false);

    // Toggle terminal via store action
    act(() => {
      useGitStore.getState().toggleTerminal();
    });
    expect(useGitStore.getState().isTerminalOpen).toBe(true);

    // Toggle terminal via topbar toggle button
    const toggleBtn = screen.getByTestId('terminal-toggle');
    fireEvent.click(toggleBtn);
    expect(useGitStore.getState().isTerminalOpen).toBe(false);
  });

  it('switches theme between dark and light, updating store and DOM classes', () => {
    render(<TopBar />);

    // Default is dark
    expect(useGitStore.getState().theme).toBe('dark');

    const themeToggleBtn = screen.getByTestId('theme-toggle');
    fireEvent.click(themeToggleBtn);

    expect(useGitStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(themeToggleBtn);
    expect(useGitStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('renders Sidebar with repo status, local/remote branches, stashes, and navigation tabs', () => {
    const mockRepo: RepoInfo = {
      path: 'D:/Projects/GitShow',
      current_branch: 'feature/studio-ui',
      is_detached: false,
      is_clean: true,
    };

    const mockBranches: BranchInfo[] = [
      { name: 'main', is_current: false, is_remote: false, target_commit: '1111111' },
      { name: 'feature/studio-ui', is_current: true, is_remote: false, target_commit: '2222222' },
      { name: 'origin/main', is_current: false, is_remote: true, target_commit: '1111111' },
    ];

    act(() => {
      useGitStore.getState().setRepoInfo(mockRepo);
      useGitStore.getState().setBranches(mockBranches);
    });

    render(<Sidebar />);

    // Check branch names are rendered
    expect(screen.getAllByText('feature/studio-ui').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('main')).toBeDefined();
    expect(screen.getByText('origin/main')).toBeDefined();

    // Check clean badge
    expect(screen.getByText(/clean/i)).toBeDefined();

    // Switch navigation view
    const prNavButton = screen.getByTestId('nav-pull-requests');
    fireEvent.click(prNavButton);
    expect(useGitStore.getState().activeView).toBe('pull-requests');
  });

  it('renders TopBar with repo path, quick action buttons, and CLI preview', () => {
    act(() => {
      useGitStore.getState().setRepoInfo({
        path: 'D:/Projects/GitShow',
        current_branch: 'main',
        is_detached: false,
        is_clean: false,
      });
      useGitStore.getState().setCliPreview('git fetch --all --prune');
    });

    render(<TopBar />);

    expect(screen.getByText(/GitShow/i)).toBeDefined();
    expect(screen.getByText(/main/i)).toBeDefined();
    expect(screen.getByText('git fetch --all --prune')).toBeDefined();
    expect(screen.getByTitle(/Fetch/i)).toBeDefined();
    expect(screen.getByTitle(/Pull/i)).toBeDefined();
    expect(screen.getByTitle(/Push/i)).toBeDefined();
  });
});
