import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { DagCanvas } from '../src/components/graph/DagCanvas';
import { UndoModal } from '../src/components/undo/UndoModal';
import { SimulationPrompt } from '../src/components/undo/SimulationPrompt';
import { InteractiveRebaseModal } from '../src/components/rebase/InteractiveRebaseModal';
import { PrStudio } from '../src/components/github/PrStudio';
import { ForkSyncButton } from '../src/components/github/ForkSyncButton';
import { CommandBridgeDrawer } from '../src/components/cli-bridge/CommandBridgeDrawer';
import { useGitStore } from '../src/store/gitStore';
import type { DagCommit } from '../src/types/git';

describe('Task 5: Studio-Wide Bilingual Integration Test', () => {
  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        language: 'en',
        commits: [],
        stagedFiles: [],
        unstagedFiles: [],
        cliPreview: 'git status',
      });
    });
  });

  it('localizes DagCanvas empty state and context menu actions', () => {
    const sampleCommits: DagCommit[] = [
      {
        id: 'c111111111111111111111111111111111111111',
        short_id: 'c111111',
        summary: 'Initial commit',
        author_name: 'Dev',
        author_email: 'dev@test.com',
        timestamp: 1600000000,
        parent_ids: [],
        lane: 0,
        branch_names: ['main'],
        is_head: true,
      },
    ];

    const { rerender } = render(<DagCanvas commits={[]} />);
    expect(screen.getByText('No commits found in current branch')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });
    expect(screen.getByText('Không có commit nào trong branch hiện tại')).toBeDefined();

    // Update commits in store to test context menu
    act(() => {
      useGitStore.setState({ commits: sampleCommits });
    });
    const canvas = screen.getByTestId('dag-canvas-element');
    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 20 });

    const menu = screen.getByTestId('dag-context-menu');
    expect(menu).toBeDefined();

    // In Vietnamese mode, check context menu items (preserving Git technical terms)
    expect(screen.getByTestId('menu-checkout').textContent).toContain('Checkout commit này');
    expect(screen.getByTestId('menu-merge').textContent).toContain('Merge vào nhánh HEAD hiện tại');
    expect(screen.getByTestId('menu-rebase').textContent).toContain('Rebase nhánh hiện tại lên commit này');
    expect(screen.getByTestId('menu-cherry-pick').textContent).toContain('Cherry-pick commit này');

    // Switch back to English
    act(() => {
      useGitStore.getState().setLanguage('en');
    });
    expect(screen.getByTestId('menu-checkout').textContent).toContain('Checkout this commit');
    expect(screen.getByTestId('menu-merge').textContent).toContain('Merge into current HEAD');
    expect(screen.getByTestId('menu-rebase').textContent).toContain('Rebase current branch onto this');
    expect(screen.getByTestId('menu-cherry-pick').textContent).toContain('Cherry-pick commit');
  });

  it('localizes Safe Undo modal and Simulation prompt', () => {
    const { rerender } = render(<UndoModal isOpen={true} onClose={() => {}} snapshots={[]} />);

    expect(screen.getByText('Reflog Time Machine (Safe Undo)')).toBeDefined();
    expect(screen.getByText('No undo snapshots available for this repository')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Reflog Time Machine (Safe Undo)')).toBeDefined();
    expect(screen.getByText('Chưa có snapshot nào cho repository này')).toBeDefined();

    // SimulationPrompt
    rerender(
      <SimulationPrompt
        isOpen={true}
        actionName="git reset --hard HEAD~1"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    // In Vietnamese mode
    expect(screen.getByText('Cảnh báo mô phỏng')).toBeDefined();
    expect(screen.getByTestId('simulation-confirm-btn').textContent).toContain('Xác nhận tiếp tục');
    expect(screen.getByTestId('simulation-cancel-btn').textContent).toContain('Hủy thao tác');

    // Switch to English
    act(() => {
      useGitStore.getState().setLanguage('en');
    });
    expect(screen.getByText('Simulation Preview — Destructive Action')).toBeDefined();
    expect(screen.getByTestId('simulation-confirm-btn').textContent).toContain('Proceed with mutation');
    expect(screen.getByTestId('simulation-cancel-btn').textContent).toContain('Cancel operation');
  });

  it('localizes Interactive Rebase modal', () => {
    render(
      <InteractiveRebaseModal
        isOpen={true}
        onClose={() => {}}
        initialItems={[{ sha: 'abc1234', action: 'pick', message: 'test' }]}
      />
    );

    expect(screen.getByText('Interactive Rebase Studio')).toBeDefined();
    expect(screen.getByTestId('cancel-rebase-btn').textContent).toContain('Cancel');
    expect(screen.getByTestId('start-rebase-btn').textContent).toContain('Start Rebase');

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Interactive Rebase Studio')).toBeDefined();
    expect(screen.getByTestId('cancel-rebase-btn').textContent).toContain('Hủy');
    expect(screen.getByTestId('start-rebase-btn').textContent).toContain('Bắt đầu Rebase');
  });

  it('localizes GitHub PR Studio and ForkSyncButton', () => {
    render(
      <div>
        <PrStudio initialPrs={[]} repoOwner="octocat" repoName="Hello-World" />
      </div>
    );

    expect(screen.getByText('No pull requests found')).toBeDefined();
    expect(screen.getByTestId('fork-sync-btn').textContent).toContain('Sync Fork');

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Không tìm thấy pull request nào')).toBeDefined();
    expect(screen.getByTestId('fork-sync-btn').textContent).toContain('Sync Fork');
  });

  it('localizes CommandBridgeDrawer copy and explain controls', () => {
    render(<CommandBridgeDrawer />);

    expect(screen.getByTestId('cli-copy-btn').textContent).toContain('Copy');
    expect(screen.getByTestId('cli-explain-btn').textContent).toContain('Explain Flags');

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByTestId('cli-copy-btn').textContent).toContain('Sao chép CLI');
    expect(screen.getByTestId('cli-explain-btn').textContent).toContain('Giải thích cờ lệnh');
  });
});
