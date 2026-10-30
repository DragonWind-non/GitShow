import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { InteractiveRebaseModal } from '../src/components/rebase/InteractiveRebaseModal';
import { RebaseItemRow } from '../src/components/rebase/RebaseItemRow';
import type { RebaseItem, RebaseAction } from '../src/types/git';
import { useGitStore } from '../src/store/gitStore';

describe('Task 17: Visual Interactive Rebase Modal', () => {
  const mockInitialItems: RebaseItem[] = [
    {
      sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      action: 'pick',
      message: 'feat: add initial user authentication',
    },
    {
      sha: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
      action: 'pick',
      message: 'fix: resolve auth token refresh bug',
    },
    {
      sha: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
      action: 'pick',
      message: 'docs: update login API documentation',
    },
  ];

  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        repoInfo: {
          path: '/test/repo',
          current_branch: 'feature/auth',
          is_detached: false,
          is_clean: true,
        },
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
  });

  describe('RebaseItemRow Component', () => {
    it('renders commit short hash, action selector, message, and move controls', () => {
      const handleChangeAction = vi.fn();
      const handleChangeMessage = vi.fn();
      const handleMoveUp = vi.fn();
      const handleMoveDown = vi.fn();

      render(
        <RebaseItemRow
          item={mockInitialItems[0]}
          index={0}
          totalItems={3}
          onChangeAction={handleChangeAction}
          onChangeMessage={handleChangeMessage}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
      );

      // Short SHA
      expect(screen.getByText('1a2b3c4')).toBeDefined();
      // Message
      expect(screen.getByText('feat: add initial user authentication')).toBeDefined();

      // Action selector
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('pick');

      // Move Up should be disabled for index 0
      const moveUpBtn = screen.getByTestId('move-up-0') as HTMLButtonElement;
      expect(moveUpBtn.disabled).toBe(true);

      // Move Down should be enabled
      const moveDownBtn = screen.getByTestId('move-down-0') as HTMLButtonElement;
      expect(moveDownBtn.disabled).toBe(false);
      fireEvent.click(moveDownBtn);
      expect(handleMoveDown).toHaveBeenCalledWith(0);
    });

    it('changes action when user selects a different action', () => {
      const handleChangeAction = vi.fn();
      render(
        <RebaseItemRow
          item={mockInitialItems[1]}
          index={1}
          totalItems={3}
          onChangeAction={handleChangeAction}
          onChangeMessage={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'squash' } });
      expect(handleChangeAction).toHaveBeenCalledWith(1, 'squash');
    });

    it('applies strikethrough styling when action is drop', () => {
      const item: RebaseItem = {
        sha: '4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
        action: 'drop',
        message: 'temp: remove debugging console logs',
      };

      render(
        <RebaseItemRow
          item={item}
          index={0}
          totalItems={1}
          onChangeAction={vi.fn()}
          onChangeMessage={vi.fn()}
        />
      );

      const msgContainer = screen.getByTestId('rebase-item-msg-0');
      expect(msgContainer.className).toContain('line-through');
    });

    it('allows editing message when reword is selected or edit input is changed', () => {
      const handleChangeMessage = vi.fn();
      const item: RebaseItem = {
        sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
        action: 'reword',
        message: 'fix: previous typo',
      };

      render(
        <RebaseItemRow
          item={item}
          index={0}
          totalItems={1}
          onChangeAction={vi.fn()}
          onChangeMessage={handleChangeMessage}
        />
      );

      const input = screen.getByDisplayValue('fix: previous typo');
      fireEvent.change(input, { target: { value: 'fix: corrected commit message' } });
      expect(handleChangeMessage).toHaveBeenCalledWith(0, 'fix: corrected commit message');
    });
  });

  describe('InteractiveRebaseModal Component', () => {
    it('does not render modal when isOpen is false', () => {
      render(
        <InteractiveRebaseModal
          isOpen={false}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      expect(screen.queryByTestId('rebase-modal')).toBeNull();
    });

    it('renders rebase modal with header, items, and CLI preview command', () => {
      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          targetBranch="main"
          initialItems={mockInitialItems}
        />
      );

      expect(screen.getByTestId('rebase-modal')).toBeDefined();
      expect(screen.getByText(/interactive rebase/i)).toBeDefined();
      expect(screen.getAllByText(/origin\/main/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('git rebase -i origin/main')).toBeDefined();

      const items = screen.getAllByTestId(/rebase-item-row-/);
      expect(items.length).toBe(3);
    });

    it('changing commit action updates item in the rebase sequence', () => {
      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      expect(selects[1].value).toBe('pick');

      fireEvent.change(selects[1], { target: { value: 'squash' } });
      expect(selects[1].value).toBe('squash');
    });

    it('editing commit message updates the item in state', () => {
      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      // Select reword on second commit
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      fireEvent.change(selects[1], { target: { value: 'reword' } });

      const msgInput = screen.getByDisplayValue('fix: resolve auth token refresh bug');
      fireEvent.change(msgInput, { target: { value: 'fix(auth): resolve refresh bug properly' } });

      expect(screen.getByDisplayValue('fix(auth): resolve refresh bug properly')).toBeDefined();
    });

    it('moving items up and down reorders the commits list', () => {
      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      // Move item 1 up to index 0
      const moveUpBtn = screen.getByTestId('move-up-1');
      fireEvent.click(moveUpBtn);

      const rows = screen.getAllByTestId(/rebase-item-row-/);
      // First row now has '2b3c4d5'
      expect(rows[0].textContent).toContain('2b3c4d5');
      // Second row now has '1a2b3c4'
      expect(rows[1].textContent).toContain('1a2b3c4');
    });

    it('drag and drop reorders the commits list', () => {
      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      const rows = screen.getAllByTestId(/rebase-item-row-/);
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue('2'), // dragged item index 2
        effectAllowed: 'move',
        dropEffect: 'move',
      };

      // Drag item index 2 (docs: update login API...)
      fireEvent.dragStart(rows[2], { dataTransfer });
      // Drag over index 0
      fireEvent.dragOver(rows[0], { dataTransfer });
      // Drop onto index 0
      fireEvent.drop(rows[0], { dataTransfer });

      const updatedRows = screen.getAllByTestId(/rebase-item-row-/);
      // Index 0 should now be the docs commit ('3c4d5e6')
      expect(updatedRows[0].textContent).toContain('3c4d5e6');
    });

    it('clicking "Start Rebase" invokes onRebase with baseSha and current items payload', async () => {
      const handleRebase = vi.fn().mockResolvedValue(undefined);

      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
          onRebase={handleRebase}
        />
      );

      // Change commit 2 action to squash
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[1], { target: { value: 'squash' } });

      const startBtn = screen.getByTestId('start-rebase-btn');
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(handleRebase).toHaveBeenCalledTimes(1);
        const [calledBaseSha, calledItems] = handleRebase.mock.calls[0];
        expect(calledBaseSha).toBe('origin/main');
        expect(calledItems[0].action).toBe('pick');
        expect(calledItems[1].action).toBe('squash');
        expect(calledItems[2].action).toBe('pick');
      });

      // Verify CLI preview was updated in gitStore
      expect(useGitStore.getState().cliPreview).toBe('git rebase -i origin/main');
    });

    it('closes modal when cancel button, close button, backdrop is clicked or Escape key pressed', () => {
      const handleClose = vi.fn();
      const { rerender } = render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={handleClose}
          baseSha="origin/main"
          initialItems={mockInitialItems}
        />
      );

      // Close button
      fireEvent.click(screen.getByTestId('close-rebase-modal'));
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Cancel button
      fireEvent.click(screen.getByTestId('cancel-rebase-btn'));
      expect(handleClose).toHaveBeenCalledTimes(2);

      // Backdrop click
      fireEvent.click(screen.getByTestId('rebase-modal-backdrop'));
      expect(handleClose).toHaveBeenCalledTimes(3);

      // Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(4);
    });

    it('shows loading state and disables Start Rebase button while submitting', async () => {
      let resolveRebase: () => void = () => {};
      const pendingPromise = new Promise<void>((resolve) => {
        resolveRebase = resolve;
      });
      const handleRebase = vi.fn().mockReturnValue(pendingPromise);

      render(
        <InteractiveRebaseModal
          isOpen={true}
          onClose={vi.fn()}
          baseSha="origin/main"
          initialItems={mockInitialItems}
          onRebase={handleRebase}
        />
      );

      const startBtn = screen.getByTestId('start-rebase-btn') as HTMLButtonElement;
      expect(startBtn.disabled).toBe(false);

      fireEvent.click(startBtn);

      expect(startBtn.disabled).toBe(true);
      expect(screen.getByText(/rebasing/i)).toBeDefined();

      await act(async () => {
        resolveRebase();
      });

      await waitFor(() => {
        expect(startBtn.disabled).toBe(false);
      });
    });
  });
});
