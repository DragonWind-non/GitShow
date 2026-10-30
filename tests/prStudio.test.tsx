import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ForkSyncButton } from '../src/components/github/ForkSyncButton';
import { PrDetailView } from '../src/components/github/PrDetailView';
import { PrStudio } from '../src/components/github/PrStudio';
import { AppLayout } from '../src/components/layout/AppLayout';
import type { PullRequestItem } from '../src/types/git';
import { useGitStore } from '../src/store/gitStore';

describe('Task 18: GitHub PR Studio & Fork Sync View', () => {
  const mockPrs: PullRequestItem[] = [
    {
      number: 101,
      title: 'feat: add OAuth2 login flow',
      author: 'alice',
      state: 'OPEN',
      head_ref: 'feature/oauth',
      base_ref: 'main',
      comments_count: 3,
      review_decision: 'APPROVED',
    },
    {
      number: 102,
      title: 'fix: handle token expiry in background worker',
      author: 'bob',
      state: 'MERGED',
      head_ref: 'fix/token-expiry',
      base_ref: 'main',
      comments_count: 5,
      review_decision: 'APPROVED',
    },
    {
      number: 103,
      title: 'chore: deprecated legacy api client',
      author: 'charlie',
      state: 'CLOSED',
      head_ref: 'chore/deprecate-legacy',
      base_ref: 'main',
      comments_count: 1,
      review_decision: 'CHANGES_REQUESTED',
    },
  ];

  const mockDiff = [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@ -1,3 +1,4 @@',
    ' export function login() {',
    '+  console.log("OAuth flow started");',
    '   return true;',
    ' }',
  ].join('\n');

  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        repoInfo: {
          path: '/test/repo',
          current_branch: 'main',
          is_detached: false,
          is_clean: true,
        },
        branches: [],
        tags: [],
        commits: [],
        selectedCommit: null,
        selectedFile: null,
        activeDiff: null,
        stagedFiles: [],
        unstagedFiles: [],
        cliPreview: '',
        isTerminalOpen: false,
        theme: 'dark',
        activeView: 'history',
      });
    });
  });

  describe('ForkSyncButton Component', () => {
    it('renders idle state and triggers sync on click with default main branch', async () => {
      const onSync = vi.fn().mockResolvedValue(undefined);

      render(<ForkSyncButton onSync={onSync} />);

      const button = screen.getByTestId('fork-sync-btn');
      expect(button).toBeDefined();
      expect(screen.getByText('Sync Fork')).toBeDefined();

      await act(async () => {
        fireEvent.click(button);
      });

      expect(onSync).toHaveBeenCalledTimes(1);
      expect(useGitStore.getState().cliPreview).toBe('git fetch upstream && git merge upstream/main');
      expect(screen.getByText('Synced!')).toBeDefined();
    });

    it('uses custom upstream branch and displays in CLI preview', async () => {
      const onSync = vi.fn().mockResolvedValue(undefined);

      render(<ForkSyncButton upstreamBranch="develop" onSync={onSync} />);

      const button = screen.getByTestId('fork-sync-btn');
      await act(async () => {
        fireEvent.click(button);
      });

      expect(useGitStore.getState().cliPreview).toBe('git fetch upstream && git merge upstream/develop');
    });

    it('shows error state if sync operation fails', async () => {
      const onSync = vi.fn().mockRejectedValue(new Error('Merge conflict in upstream'));

      render(<ForkSyncButton onSync={onSync} />);

      const button = screen.getByTestId('fork-sync-btn');
      await act(async () => {
        fireEvent.click(button);
      });

      expect(screen.getByTestId('fork-sync-error')).toBeDefined();
      expect(screen.getByText(/Merge conflict in upstream/i)).toBeDefined();
    });
  });

  describe('PrDetailView Component', () => {
    it('renders PR header, branches, author, review status, and comment count', () => {
      render(
        <PrDetailView
          pr={mockPrs[0]}
          diff={mockDiff}
        />
      );

      expect(screen.getByText(/#101/)).toBeDefined();
      expect(screen.getByText(/add OAuth2 login flow/)).toBeDefined();
      expect(screen.getByText(/@alice/)).toBeDefined();
      expect(screen.getByText('OPEN')).toBeDefined();
      expect(screen.getByText(/feature\/oauth/)).toBeDefined();
      expect(screen.getByText(/main/)).toBeDefined();
      expect(screen.getByText('APPROVED')).toBeDefined();
      expect(screen.getByTestId('pr-comments-count').textContent).toContain('3');
    });

    it('renders DiffViewer with unified diff content', () => {
      render(
        <PrDetailView
          pr={mockPrs[0]}
          diff={mockDiff}
        />
      );

      expect(screen.getByTestId('diff-view-unified')).toBeDefined();
      expect(screen.getByText(/OAuth flow started/)).toBeDefined();
    });

    it('renders loading spinner when isLoadingDiff is true', () => {
      render(
        <PrDetailView
          pr={mockPrs[0]}
          isLoadingDiff={true}
        />
      );

      expect(screen.getByTestId('pr-diff-loading')).toBeDefined();
    });

    it('handles Approve and Merge actions and updates cliPreview', async () => {
      const onApprove = vi.fn();
      const onMerge = vi.fn();

      render(
        <PrDetailView
          pr={mockPrs[0]}
          diff={mockDiff}
          onApprove={onApprove}
          onMerge={onMerge}
        />
      );

      const approveBtn = screen.getByTestId('pr-approve-btn');
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      expect(onApprove).toHaveBeenCalledWith(101);
      expect(useGitStore.getState().cliPreview).toBe('gh pr review 101 --approve');

      const mergeBtn = screen.getByTestId('pr-merge-btn');
      await act(async () => {
        fireEvent.click(mergeBtn);
      });
      expect(onMerge).toHaveBeenCalledWith(101);
      expect(useGitStore.getState().cliPreview).toBe('gh pr merge 101 --merge');
    });

    it('handles back button click when onBack is provided', () => {
      const onBack = vi.fn();
      render(
        <PrDetailView
          pr={mockPrs[0]}
          onBack={onBack}
        />
      );

      const backBtn = screen.getByTestId('pr-back-btn');
      fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('PrStudio Component', () => {
    it('renders PR list with all mock items and displays empty detail state when none selected', () => {
      render(<PrStudio initialPrs={mockPrs} />);

      expect(screen.getByText('feat: add OAuth2 login flow')).toBeDefined();
      expect(screen.getByText('fix: handle token expiry in background worker')).toBeDefined();
      expect(screen.getByText('chore: deprecated legacy api client')).toBeDefined();
      expect(screen.getByTestId('pr-studio-empty-detail')).toBeDefined();
    });

    it('filters PRs by state tabs (All, Open, Merged, Closed)', () => {
      render(<PrStudio initialPrs={mockPrs} />);

      // Filter Open
      fireEvent.click(screen.getByTestId('pr-filter-open'));
      expect(screen.getByText('feat: add OAuth2 login flow')).toBeDefined();
      expect(screen.queryByText('fix: handle token expiry in background worker')).toBeNull();
      expect(screen.queryByText('chore: deprecated legacy api client')).toBeNull();

      // Filter Merged
      fireEvent.click(screen.getByTestId('pr-filter-merged'));
      expect(screen.queryByText('feat: add OAuth2 login flow')).toBeNull();
      expect(screen.getByText('fix: handle token expiry in background worker')).toBeDefined();
      expect(screen.queryByText('chore: deprecated legacy api client')).toBeNull();

      // Filter Closed
      fireEvent.click(screen.getByTestId('pr-filter-closed'));
      expect(screen.queryByText('feat: add OAuth2 login flow')).toBeNull();
      expect(screen.queryByText('fix: handle token expiry in background worker')).toBeNull();
      expect(screen.getByText('chore: deprecated legacy api client')).toBeDefined();

      // Back to All
      fireEvent.click(screen.getByTestId('pr-filter-all'));
      expect(screen.getByText('feat: add OAuth2 login flow')).toBeDefined();
      expect(screen.getByText('fix: handle token expiry in background worker')).toBeDefined();
      expect(screen.getByText('chore: deprecated legacy api client')).toBeDefined();
    });

    it('filters PRs by search query matching title or author', () => {
      render(<PrStudio initialPrs={mockPrs} />);

      const searchInput = screen.getByTestId('pr-search-input');

      // Search by title keyword
      fireEvent.change(searchInput, { target: { value: 'expiry' } });
      expect(screen.queryByText('feat: add OAuth2 login flow')).toBeNull();
      expect(screen.getByText('fix: handle token expiry in background worker')).toBeDefined();

      // Search by author
      fireEvent.change(searchInput, { target: { value: 'charlie' } });
      expect(screen.queryByText('fix: handle token expiry in background worker')).toBeNull();
      expect(screen.getByText('chore: deprecated legacy api client')).toBeDefined();

      // Search by PR number
      fireEvent.change(searchInput, { target: { value: '101' } });
      expect(screen.getByText('feat: add OAuth2 login flow')).toBeDefined();
      expect(screen.queryByText('chore: deprecated legacy api client')).toBeNull();
    });

    it('selects a PR from the list and displays PrDetailView', () => {
      const onSelectPr = vi.fn();
      render(<PrStudio initialPrs={mockPrs} onSelectPr={onSelectPr} />);

      const prCard = screen.getByTestId('pr-card-101');
      fireEvent.click(prCard);

      expect(onSelectPr).toHaveBeenCalledWith(mockPrs[0]);
      expect(screen.queryByTestId('pr-studio-empty-detail')).toBeNull();
      expect(screen.getByTestId('pr-detail-view')).toBeDefined();
      expect(screen.getAllByText('@alice').length).toBeGreaterThanOrEqual(1);
    });

    it('contains ForkSyncButton and Refresh button in action bar', () => {
      render(<PrStudio initialPrs={mockPrs} />);

      expect(screen.getByTestId('fork-sync-btn')).toBeDefined();
      expect(screen.getByTestId('pr-refresh-btn')).toBeDefined();
    });
  });

  describe('AppLayout Integration', () => {
    it('mounts PrStudio when activeView is pull-requests', () => {
      act(() => {
        useGitStore.getState().setActiveView('pull-requests');
      });

      render(<AppLayout />);

      expect(screen.getByTestId('pr-studio-container')).toBeDefined();
      expect(screen.getByTestId('fork-sync-btn')).toBeDefined();
    });
  });
});
