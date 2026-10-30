import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { StagingPanel } from '../src/components/staging/StagingPanel';
import { FileItem } from '../src/components/staging/FileItem';
import { AppLayout } from '../src/components/layout/AppLayout';
import { useGitStore } from '../src/store/gitStore';
import type { FileStatus } from '../src/types/git';

describe('Task 13: Staging Area & Commit Box', () => {
  const mockStagedFiles: FileStatus[] = [
    { path: 'src/components/staging/FileItem.tsx', status: 'added', staged: true },
    { path: 'src/types/git.ts', status: 'modified', staged: true },
  ];

  const mockUnstagedFiles: FileStatus[] = [
    { path: 'src/components/staging/StagingPanel.tsx', status: 'untracked', staged: false },
    { path: 'src/App.tsx', status: 'modified', staged: false },
    { path: 'docs/old-guide.md', status: 'deleted', staged: false },
    { path: 'src/legacy/utils.ts', status: 'renamed', staged: false },
  ];

  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        repoInfo: null,
        branches: [],
        tags: [],
        stashes: [],
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

  describe('FileItem', () => {
    it('renders file details with correct status badges and paths', () => {
      const file: FileStatus = {
        path: 'src/components/staging/FileItem.tsx',
        status: 'modified',
        staged: false,
      };

      render(<FileItem file={file} />);

      expect(screen.getByText('FileItem.tsx')).toBeDefined();
      expect(screen.getByText('src/components/staging/')).toBeDefined();
      expect(screen.getByText('M')).toBeDefined();
    });

    it('renders correct status badges for all git statuses', () => {
      const statuses: Array<FileStatus['status']> = ['modified', 'added', 'deleted', 'untracked', 'renamed'];
      const expectedBadges = ['M', 'A', 'D', 'U', 'R'];

      statuses.forEach((status, idx) => {
        const { unmount } = render(
          <FileItem
            file={{
              path: `file-${status}.txt`,
              status,
              staged: false,
            }}
          />
        );
        expect(screen.getByText(expectedBadges[idx])).toBeDefined();
        unmount();
      });
    });

    it('triggers stage action for unstaged file and unstage action for staged file', () => {
      const onStage = vi.fn();
      const onUnstage = vi.fn();

      const unstagedFile: FileStatus = { path: 'file1.txt', status: 'modified', staged: false };
      const { unmount } = render(<FileItem file={unstagedFile} onStage={onStage} />);

      const stageBtn = screen.getByTestId('stage-file-file1.txt');
      fireEvent.click(stageBtn);
      expect(onStage).toHaveBeenCalledWith(unstagedFile);
      unmount();

      const stagedFile: FileStatus = { path: 'file2.txt', status: 'modified', staged: true };
      render(<FileItem file={stagedFile} onUnstage={onUnstage} />);

      const unstageBtn = screen.getByTestId('unstage-file-file2.txt');
      fireEvent.click(unstageBtn);
      expect(onUnstage).toHaveBeenCalledWith(stagedFile);
    });

    it('handles discard changes with confirmation flow', () => {
      const onDiscard = vi.fn();
      const file: FileStatus = { path: 'file.txt', status: 'modified', staged: false };

      render(<FileItem file={file} onDiscard={onDiscard} />);

      const discardBtn = screen.getByTestId('discard-file-file.txt');
      fireEvent.click(discardBtn);

      // Confirm button should appear
      const confirmBtn = screen.getByTestId('confirm-discard-file.txt');
      expect(confirmBtn).toBeDefined();

      fireEvent.click(confirmBtn);
      expect(onDiscard).toHaveBeenCalledWith(file);
    });
  });

  describe('StagingPanel', () => {
    it('renders staged and unstaged file lists with count headers', () => {
      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
        />
      );

      expect(screen.getByText(/Staged Changes/i)).toBeDefined();
      expect(screen.getByText(/^Changes$/)).toBeDefined();
      expect(screen.getByText('FileItem.tsx')).toBeDefined();
      expect(screen.getByText('StagingPanel.tsx')).toBeDefined();
    });

    it('filters files using the search input', () => {
      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
        />
      );

      const filterInput = screen.getByPlaceholderText(/filter/i);
      fireEvent.change(filterInput, { target: { value: 'FileItem' } });

      expect(screen.getByText('FileItem.tsx')).toBeDefined();
      expect(screen.queryByText('StagingPanel.tsx')).toBeNull();
    });

    it('clicks Stage All: moves all files to staged list and updates CLI preview', () => {
      const onStageAll = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onStageAll={onStageAll}
        />
      );

      const stageAllBtn = screen.getByTestId('stage-all-btn');
      fireEvent.click(stageAllBtn);

      expect(onStageAll).toHaveBeenCalled();
      expect(useGitStore.getState().cliPreview).toBe('git add -A');
      expect(useGitStore.getState().stagedFiles.length).toBe(
        mockStagedFiles.length + mockUnstagedFiles.length
      );
      expect(useGitStore.getState().unstagedFiles.length).toBe(0);
    });

    it('clicks Unstage All: moves all files to unstaged list and updates CLI preview', () => {
      const onUnstageAll = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onUnstageAll={onUnstageAll}
        />
      );

      const unstageAllBtn = screen.getByTestId('unstage-all-btn');
      fireEvent.click(unstageAllBtn);

      expect(onUnstageAll).toHaveBeenCalled();
      expect(useGitStore.getState().cliPreview).toBe('git restore --staged .');
      expect(useGitStore.getState().stagedFiles.length).toBe(0);
      expect(useGitStore.getState().unstagedFiles.length).toBe(
        mockStagedFiles.length + mockUnstagedFiles.length
      );
    });

    it('stages a single file and updates CLI preview', () => {
      const onStage = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onStage={onStage}
        />
      );

      const stageBtn = screen.getByTestId('stage-file-src/App.tsx');
      fireEvent.click(stageBtn);

      expect(onStage).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'src/App.tsx' })
      );
      expect(useGitStore.getState().cliPreview).toBe('git add "src/App.tsx"');
    });

    it('unstages a single file and updates CLI preview', () => {
      const onUnstage = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onUnstage={onUnstage}
        />
      );

      const unstageBtn = screen.getByTestId(
        'unstage-file-src/components/staging/FileItem.tsx'
      );
      fireEvent.click(unstageBtn);

      expect(onUnstage).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'src/components/staging/FileItem.tsx' })
      );
      expect(useGitStore.getState().cliPreview).toBe(
        'git restore --staged "src/components/staging/FileItem.tsx"'
      );
    });

    it('updates CLI preview in realtime when typing commit message', () => {
      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
        />
      );

      const messageInput = screen.getByPlaceholderText(/commit message/i);
      fireEvent.change(messageInput, { target: { value: 'feat(staging): add commit box' } });

      expect(useGitStore.getState().cliPreview).toBe(
        'git commit -m "feat(staging): add commit box"'
      );
    });

    it('toggles Amend and updates CLI preview', () => {
      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
        />
      );

      const messageInput = screen.getByPlaceholderText(/commit message/i);
      fireEvent.change(messageInput, { target: { value: 'fix(core): typo in graph' } });

      const amendCheckbox = screen.getByLabelText(/amend/i);
      fireEvent.click(amendCheckbox);

      expect(useGitStore.getState().cliPreview).toBe(
        'git commit --amend -m "fix(core): typo in graph"'
      );

      fireEvent.click(amendCheckbox);
      expect(useGitStore.getState().cliPreview).toBe(
        'git commit -m "fix(core): typo in graph"'
      );
    });

    it('applies Conventional Commits helper pills to commit message', () => {
      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
        />
      );

      const featPill = screen.getByRole('button', { name: /^feat$/i });
      fireEvent.click(featPill);

      const messageInput = screen.getByPlaceholderText(/commit message/i) as HTMLTextAreaElement;
      expect(messageInput.value).toBe('feat: ');
      expect(useGitStore.getState().cliPreview).toBe('git commit -m "feat: "');

      const fixPill = screen.getByRole('button', { name: /^fix$/i });
      fireEvent.click(fixPill);
      expect(messageInput.value).toBe('fix: ');
      expect(useGitStore.getState().cliPreview).toBe('git commit -m "fix: "');
    });

    it('clicks Commit: invokes onCommit handler and clears message input', () => {
      const onCommit = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onCommit={onCommit}
        />
      );

      const messageInput = screen.getByPlaceholderText(/commit message/i) as HTMLTextAreaElement;
      fireEvent.change(messageInput, { target: { value: 'feat: ready to ship' } });

      const commitBtn = screen.getByTestId('commit-btn');
      fireEvent.click(commitBtn);

      expect(onCommit).toHaveBeenCalledWith('feat: ready to ship', false);
      expect(messageInput.value).toBe('');
    });

    it('supports Ctrl+Enter keyboard shortcut to commit', () => {
      const onCommit = vi.fn();

      render(
        <StagingPanel
          stagedFiles={mockStagedFiles}
          unstagedFiles={mockUnstagedFiles}
          onCommit={onCommit}
        />
      );

      const messageInput = screen.getByPlaceholderText(/commit message/i) as HTMLTextAreaElement;
      fireEvent.change(messageInput, { target: { value: 'chore: bump dependencies' } });

      fireEvent.keyDown(messageInput, { key: 'Enter', ctrlKey: true });

      expect(onCommit).toHaveBeenCalledWith('chore: bump dependencies', false);
      expect(messageInput.value).toBe('');
    });

    it('mounts StagingPanel as the default right inspector in AppLayout', () => {
      act(() => {
        useGitStore.setState({
          stagedFiles: mockStagedFiles,
          unstagedFiles: mockUnstagedFiles,
        });
      });

      render(<AppLayout />);

      const rightColumn = screen.getByTestId('right-column');
      expect(rightColumn).toBeDefined();
      expect(screen.getByText(/Staged Changes/i)).toBeDefined();
      expect(screen.getByText(/^Changes$/)).toBeDefined();
    });
  });
});
