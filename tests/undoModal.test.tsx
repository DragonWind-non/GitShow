import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { UndoModal } from '../src/components/undo/UndoModal';
import { SimulationPrompt } from '../src/components/undo/SimulationPrompt';
import type { UndoSnapshot } from '../src/types/git';
import { useGitStore } from '../src/store/gitStore';

describe('Task 16: Safe Undo Reflog Time Machine Modal & Simulation Preview', () => {
  const mockSnapshots: UndoSnapshot[] = [
    {
      id: 'snap-1',
      timestamp: 1714470000,
      action_name: 'git reset --hard HEAD~1',
      pre_head_sha: 'a1b2c3d4e5f678901234567890abcdef12345678',
      dangling_stash_sha: 'stash@{0}',
      restore_cli_command: 'git reset --hard a1b2c3d && git stash apply stash@{0}',
    },
    {
      id: 'snap-2',
      timestamp: 1714460000,
      action_name: 'git rebase -i main',
      pre_head_sha: 'f1e2d3c4b5a678901234567890abcdef12345678',
      dangling_stash_sha: null,
      restore_cli_command: 'git reset --hard f1e2d3c',
    },
  ];

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
        stagedFiles: [],
        unstagedFiles: [],
        cliPreview: '',
        isTerminalOpen: false,
        theme: 'dark',
        activeView: 'history',
      });
    });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('UndoModal Component', () => {
    it('does not render anything when isOpen is false', () => {
      render(
        <UndoModal
          isOpen={false}
          onClose={vi.fn()}
          snapshots={mockSnapshots}
        />
      );

      expect(screen.queryByTestId('undo-modal')).toBeNull();
    });

    it('renders empty state message when snapshots list is empty', () => {
      render(
        <UndoModal
          isOpen={true}
          onClose={vi.fn()}
          snapshots={[]}
        />
      );

      expect(screen.getByTestId('undo-modal')).toBeDefined();
      expect(screen.getByTestId('undo-empty-state')).toBeDefined();
      expect(screen.getByText(/no undo snapshots available/i)).toBeDefined();
    });

    it('renders list of snapshot timeline cards with action names, commit hashes, and timestamps', () => {
      render(
        <UndoModal
          isOpen={true}
          onClose={vi.fn()}
          snapshots={mockSnapshots}
        />
      );

      expect(screen.getByTestId('undo-modal')).toBeDefined();
      expect(screen.getByTestId('undo-snapshot-list')).toBeDefined();

      // Check first snapshot card
      expect(screen.getByText('git reset --hard HEAD~1')).toBeDefined();
      expect(screen.getAllByText(/a1b2c3d/).length).toBeGreaterThanOrEqual(1);

      // Check second snapshot card
      expect(screen.getByText('git rebase -i main')).toBeDefined();
      expect(screen.getAllByText(/f1e2d3c/).length).toBeGreaterThanOrEqual(1);

      // Check restore command preview
      expect(screen.getByText('git reset --hard a1b2c3d && git stash apply stash@{0}')).toBeDefined();
      expect(screen.getByText('git reset --hard f1e2d3c')).toBeDefined();
    });

    it('clicking "Rollback" invokes onRollback with the snapshot id', async () => {
      const handleRollback = vi.fn().mockResolvedValue(undefined);

      render(
        <UndoModal
          isOpen={true}
          onClose={vi.fn()}
          snapshots={mockSnapshots}
          onRollback={handleRollback}
        />
      );

      const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
      expect(rollbackButtons.length).toBe(2);

      fireEvent.click(rollbackButtons[0]);

      await waitFor(() => {
        expect(handleRollback).toHaveBeenCalledWith('snap-1');
      });
    });

    it('updates CLI preview in store when rollback is clicked', async () => {
      render(
        <UndoModal
          isOpen={true}
          onClose={vi.fn()}
          snapshots={mockSnapshots}
        />
      );

      const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
      fireEvent.click(rollbackButtons[0]);

      await waitFor(() => {
        expect(useGitStore.getState().cliPreview).toBe(mockSnapshots[0].restore_cli_command);
      });
    });

    it('copies restore CLI command when copy button is clicked', async () => {
      render(
        <UndoModal
          isOpen={true}
          onClose={vi.fn()}
          snapshots={mockSnapshots}
        />
      );

      const copyButtons = screen.getAllByTestId('copy-restore-cmd');
      expect(copyButtons.length).toBe(2);

      await act(async () => {
        fireEvent.click(copyButtons[0]);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockSnapshots[0].restore_cli_command
      );
    });

    it('closing modal invokes onClose when close button or backdrop is clicked, or Escape is pressed', () => {
      const handleClose = vi.fn();
      const { rerender } = render(
        <UndoModal
          isOpen={true}
          onClose={handleClose}
          snapshots={mockSnapshots}
        />
      );

      // Close button
      const closeBtn = screen.getByTestId('close-undo-modal');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Backdrop click
      const backdrop = screen.getByTestId('undo-modal-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(2);

      // Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(3);
    });
  });

  describe('SimulationPrompt Component', () => {
    it('does not render when isOpen is false', () => {
      render(
        <SimulationPrompt
          isOpen={false}
          actionName="Hard Reset"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByTestId('simulation-prompt')).toBeNull();
    });

    it('renders action name, target ref, and risk explanation', () => {
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset (git reset --hard)"
          currentRef="main (e4f5g6h)"
          targetRef="HEAD~1 (a1b2c3d)"
          orphanedCommitsCount={2}
          uncommittedFilesCount={3}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('simulation-prompt')).toBeDefined();
      expect(screen.getAllByText(/Hard Reset \(git reset --hard\)/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/main \(e4f5g6h\)/)).toBeDefined();
      expect(screen.getByText(/HEAD~1 \(a1b2c3d\)/)).toBeDefined();
      expect(screen.getByText(/Simulation Preview — Destructive Action/i)).toBeDefined();
    });

    it('displays warning for orphaned commits and uncommitted files when counts > 0', () => {
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset"
          orphanedCommitsCount={4}
          uncommittedFilesCount={2}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('orphaned-commits-warning')).toBeDefined();
      expect(screen.getByText(/4 orphaned commit/i)).toBeDefined();

      expect(screen.getByTestId('uncommitted-files-warning')).toBeDefined();
      expect(screen.getByText(/2 uncommitted file/i)).toBeDefined();
    });

    it('explains Safe Undo protection reassurance', () => {
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(
        screen.getByText(
          /Safe Undo Active: GitShow will automatically capture a pre-mutation snapshot and dangling stash before executing\. You can undo this action at any time\./i
        )
      ).toBeDefined();
    });

    it('clicking "Cancel" invokes onCancel', () => {
      const handleCancel = vi.fn();
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset"
          onConfirm={vi.fn()}
          onCancel={handleCancel}
        />
      );

      const cancelBtn = screen.getByTestId('simulation-cancel-btn');
      fireEvent.click(cancelBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('clicking "Proceed" invokes onConfirm', () => {
      const handleConfirm = vi.fn();
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset"
          onConfirm={handleConfirm}
          onCancel={vi.fn()}
        />
      );

      const confirmBtn = screen.getByTestId('simulation-confirm-btn');
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('disables confirm button and shows simulating indicator when isSimulating is true', () => {
      render(
        <SimulationPrompt
          isOpen={true}
          actionName="Hard Reset"
          isSimulating={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const confirmBtn = screen.getByTestId('simulation-confirm-btn') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
      expect(screen.getByText(/Simulating/i)).toBeDefined();
    });
  });
});
