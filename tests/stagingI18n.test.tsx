import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { StagingPanel } from '../src/components/staging/StagingPanel';
import { DiffViewer } from '../src/components/diff/DiffViewer';
import { useGitStore } from '../src/store/gitStore';
import type { FileStatus } from '../src/types/git';

describe('Task 4: Staging Panel & Diff Viewer Localization', () => {
  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        language: 'en',
        stagedFiles: [],
        unstagedFiles: [],
        selectedFile: null,
      });
    });
  });

  it('localizes StagingPanel headers, actions and commit box', () => {
    const unstaged: FileStatus[] = [
      { path: 'src/main.ts', status: 'modified', staged: false },
    ];
    const staged: FileStatus[] = [
      { path: 'src/lib.rs', status: 'added', staged: true },
    ];

    render(<StagingPanel stagedFiles={staged} unstagedFiles={unstaged} />);

    expect(screen.getByText('Staged Changes')).toBeDefined();
    expect(screen.getByTestId('stage-all-btn').textContent).toContain('Stage All');
    expect(screen.getByTestId('unstage-all-btn').textContent).toContain('Unstage All');
    expect(screen.getByText('Amend previous commit')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Thay đổi đã Stage')).toBeDefined();
    expect(screen.getByTestId('stage-all-btn').textContent).toContain('Stage tất cả');
    expect(screen.getByTestId('unstage-all-btn').textContent).toContain('Unstage tất cả');
    expect(screen.getByText('Amend vào commit trước')).toBeDefined();
  });

  it('localizes DiffViewer empty state and hunk action buttons', () => {
    const { rerender } = render(<DiffViewer />);

    expect(screen.getByText('No changes detected')).toBeDefined();
    expect(screen.getByText('Select a modified file to view diff')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Không phát hiện thay đổi nào')).toBeDefined();
    expect(screen.getByText('Chọn một file để xem diff')).toBeDefined();

    // With diff content
    const sampleDiff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line 1
+line 2
 line 3
`;
    rerender(<DiffViewer diff={sampleDiff} filePath="file.txt" />);

    // In Vietnamese mode
    expect(screen.getByTestId('stage-hunk-0').textContent).toContain('Stage Hunk này');
    expect(screen.getByTestId('revert-hunk-0').textContent).toContain('Revert Hunk này');

    // Switch back to English
    act(() => {
      useGitStore.getState().setLanguage('en');
    });

    expect(screen.getByTestId('stage-hunk-0').textContent).toContain('Stage Hunk');
    expect(screen.getByTestId('revert-hunk-0').textContent).toContain('Revert Hunk');
  });
});
