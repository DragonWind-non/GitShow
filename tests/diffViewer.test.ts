import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  parseUnifiedDiff,
  generateHunkPatch,
  classifyDiffLine,
} from '../src/components/diff/diffParser';
import { DiffViewer } from '../src/components/diff/DiffViewer';
import { useGitStore } from '../src/store/gitStore';
import { AppLayout } from '../src/components/layout/AppLayout';

describe('Task 14: Virtualized Lightweight Diff Viewer (Shiki)', () => {
  const sampleDiff = `diff --git a/src/utils/math.ts b/src/utils/math.ts
index 1234567..89abcdef 100644
--- a/src/utils/math.ts
+++ b/src/utils/math.ts
@@ -1,5 +1,6 @@
 import { logger } from './logger';
-export function add(a: number, b: number): number {
-  return a + b;
+export function add(a: number, b: number, c: number = 0): number {
+  logger.debug('adding numbers');
+  return a + b + c;
 }
 export const PI = 3.14159;
@@ -15,4 +16,5 @@
 export function multiply(a: number, b: number): number {
-  return a * b;
+  logger.debug('multiplying');
+  return Math.imul(a, b);
 }
`;

  describe('diffParser', () => {
    it('classifies lines correctly (header, hunk-header, add, delete, context)', () => {
      expect(classifyDiffLine('diff --git a/foo.ts b/foo.ts')).toBe('header');
      expect(classifyDiffLine('index 1234567..89abcdef 100644')).toBe('header');
      expect(classifyDiffLine('--- a/foo.ts')).toBe('header');
      expect(classifyDiffLine('+++ b/foo.ts')).toBe('header');
      expect(classifyDiffLine('@@ -1,5 +1,6 @@')).toBe('hunk-header');
      expect(classifyDiffLine('+const next = 2;')).toBe('add');
      expect(classifyDiffLine('-const old = 1;')).toBe('delete');
      expect(classifyDiffLine(' const unchanged = 0;')).toBe('context');
      expect(classifyDiffLine('')).toBe('context');
    });

    it('parses unified diff containing 2 hunks', () => {
      const parsed = parseUnifiedDiff(sampleDiff);
      expect(parsed).toHaveLength(1);

      const file = parsed[0];
      expect(file.oldPath).toBe('src/utils/math.ts');
      expect(file.newPath).toBe('src/utils/math.ts');
      expect(file.hunks).toHaveLength(2);

      // Hunk 1
      const hunk1 = file.hunks[0];
      expect(hunk1.oldStart).toBe(1);
      expect(hunk1.oldLines).toBe(5);
      expect(hunk1.newStart).toBe(1);
      expect(hunk1.newLines).toBe(6);
      expect(hunk1.header).toContain('@@ -1,5 +1,6 @@');

      // Hunk 2
      const hunk2 = file.hunks[1];
      expect(hunk2.oldStart).toBe(15);
      expect(hunk2.oldLines).toBe(4);
      expect(hunk2.newStart).toBe(16);
      expect(hunk2.newLines).toBe(5);
    });

    it('computes line numbers accurately for additions, deletions, and context', () => {
      const parsed = parseUnifiedDiff(sampleDiff);
      const hunk1 = parsed[0].hunks[0];

      // Line 0: context "import { logger } from './logger';"
      expect(hunk1.lines[0]).toEqual({
        type: 'context',
        content: "import { logger } from './logger';",
        oldLineNumber: 1,
        newLineNumber: 1,
      });

      // Line 1: delete "-export function add..."
      expect(hunk1.lines[1]).toEqual({
        type: 'delete',
        content: 'export function add(a: number, b: number): number {',
        oldLineNumber: 2,
        newLineNumber: undefined,
      });

      // Line 2: delete "-  return a + b;"
      expect(hunk1.lines[2]).toEqual({
        type: 'delete',
        content: '  return a + b;',
        oldLineNumber: 3,
        newLineNumber: undefined,
      });

      // Line 3: add "+export function add..."
      expect(hunk1.lines[3]).toEqual({
        type: 'add',
        content: 'export function add(a: number, b: number, c: number = 0): number {',
        oldLineNumber: undefined,
        newLineNumber: 2,
      });

      // Line 4: add "+  logger.debug..."
      expect(hunk1.lines[4]).toEqual({
        type: 'add',
        content: "  logger.debug('adding numbers');",
        oldLineNumber: undefined,
        newLineNumber: 3,
      });

      // Line 5: add "+  return a + b + c;"
      expect(hunk1.lines[5]).toEqual({
        type: 'add',
        content: '  return a + b + c;',
        oldLineNumber: undefined,
        newLineNumber: 4,
      });

      // Line 6: context "}"
      expect(hunk1.lines[6]).toEqual({
        type: 'context',
        content: '}',
        oldLineNumber: 4,
        newLineNumber: 5,
      });

      // Line 7: context "export const PI = 3.14159;"
      expect(hunk1.lines[7]).toEqual({
        type: 'context',
        content: 'export const PI = 3.14159;',
        oldLineNumber: 5,
        newLineNumber: 6,
      });
    });

    it('generates a valid standalone git patch for a single hunk', () => {
      const parsed = parseUnifiedDiff(sampleDiff);
      const patch0 = generateHunkPatch(parsed[0], 0);

      expect(patch0).toContain('diff --git a/src/utils/math.ts b/src/utils/math.ts');
      expect(patch0).toContain('--- a/src/utils/math.ts');
      expect(patch0).toContain('+++ b/src/utils/math.ts');
      expect(patch0).toContain('@@ -1,5 +1,6 @@');
      expect(patch0).toContain('+  return a + b + c;');
      expect(patch0).not.toContain('multiply'); // hunk 1 content should not be in hunk 0 patch
      expect(patch0.endsWith('\n')).toBe(true);

      const patch1 = generateHunkPatch(parsed[0], 1);
      expect(patch1).toContain('@@ -15,4 +16,5 @@');
      expect(patch1).toContain('+  return Math.imul(a, b);');
      expect(patch1).not.toContain('adding numbers');
    });

    it('returns empty array on empty or invalid diff', () => {
      expect(parseUnifiedDiff('')).toEqual([]);
      expect(parseUnifiedDiff('   \n  \n')).toEqual([]);
      expect(parseUnifiedDiff('not a git diff output')).toEqual([]);
    });

    it('handles new file and deleted file diffs with /dev/null', () => {
      const newFileDiff = `diff --git a/dev/null b/src/newFile.ts
new file mode 100644
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,2 @@
+const x = 1;
+export default x;
`;
      const parsedNew = parseUnifiedDiff(newFileDiff);
      expect(parsedNew[0].oldPath).toBe('/dev/null');
      expect(parsedNew[0].newPath).toBe('src/newFile.ts');
      expect(parsedNew[0].hunks[0].lines[0].type).toBe('add');
      expect(parsedNew[0].hunks[0].lines[0].newLineNumber).toBe(1);

      const patchNew = generateHunkPatch(parsedNew[0], 0);
      expect(patchNew).toContain('--- /dev/null');
      expect(patchNew).toContain('+++ b/src/newFile.ts');
    });
  });

  describe('DiffViewer Component', () => {
    beforeEach(() => {
      act(() => {
        useGitStore.setState({
          selectedFile: null,
          cliPreview: '',
        });
      });
    });

    it('renders diff viewer with header stats, hunks, and line styling', () => {
      render(React.createElement(DiffViewer, { diff: sampleDiff, isStaged: false }));

      // File path in header
      expect(screen.getByText('src/utils/math.ts')).toBeDefined();

      // Stats (+5 additions, -3 deletions across both hunks)
      expect(screen.getByText('+5')).toBeDefined();
      expect(screen.getByText('-3')).toBeDefined();

      // Hunk headers
      expect(screen.getByText(/@@ -1,5 \+1,6 @@/)).toBeDefined();
      expect(screen.getByText(/@@ -15,4 \+16,5 @@/)).toBeDefined();

      // Stage Hunk buttons (file is unstaged, so stage buttons should exist)
      expect(screen.getByTestId('stage-hunk-0')).toBeDefined();
      expect(screen.getByTestId('stage-hunk-1')).toBeDefined();
    });

    it('triggers onStageHunk when clicking Stage Hunk button', () => {
      const onStageHunk = vi.fn();
      render(
        React.createElement(DiffViewer, {
          diff: sampleDiff,
          isStaged: false,
          onStageHunk,
        })
      );

      const stageBtn = screen.getByTestId('stage-hunk-0');
      fireEvent.click(stageBtn);

      expect(onStageHunk).toHaveBeenCalledWith(
        0,
        expect.stringContaining('@@ -1,5 +1,6 @@')
      );
    });

    it('triggers onRevertHunk when clicking Revert Hunk button', () => {
      const onRevertHunk = vi.fn();
      render(
        React.createElement(DiffViewer, {
          diff: sampleDiff,
          isStaged: false,
          onRevertHunk,
        })
      );

      const revertBtn = screen.getByTestId('revert-hunk-0');
      fireEvent.click(revertBtn);

      expect(onRevertHunk).toHaveBeenCalledWith(
        0,
        expect.stringContaining('@@ -1,5 +1,6 @@')
      );
    });

    it('toggles between unified and split (side-by-side) views', () => {
      render(React.createElement(DiffViewer, { diff: sampleDiff }));

      // Default view is unified
      expect(screen.getByTestId('diff-view-unified')).toBeDefined();

      // Toggle to split view
      const splitBtn = screen.getByTestId('toggle-split-view');
      fireEvent.click(splitBtn);

      expect(screen.getByTestId('diff-view-split')).toBeDefined();

      // Toggle back to unified view
      const unifiedBtn = screen.getByTestId('toggle-unified-view');
      fireEvent.click(unifiedBtn);

      expect(screen.getByTestId('diff-view-unified')).toBeDefined();
    });

    it('renders empty placeholder when no diff is provided', () => {
      render(React.createElement(DiffViewer, { diff: '' }));
      expect(screen.getByText(/no changes/i)).toBeDefined();
    });

    it('supports onClose callback to dismiss diff viewer', () => {
      const onClose = vi.fn();
      render(React.createElement(DiffViewer, { diff: sampleDiff, onClose }));

      const closeBtn = screen.getByTestId('close-diff-btn');
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });

    it('displays DiffViewer in AppLayout when a file is selected in useGitStore', () => {
      act(() => {
        useGitStore.setState({
          selectedFile: {
            path: 'src/utils/math.ts',
            status: 'modified',
            staged: false,
          },
        });
      });

      render(React.createElement(AppLayout));

      // Right column should show DiffViewer with file path
      const rightColumn = screen.getByTestId('right-column');
      expect(rightColumn).toBeDefined();
      expect(screen.getByText('src/utils/math.ts')).toBeDefined();
    });

    it('virtualizes rendering when diff exceeds 100 lines', () => {
      const lines = Array.from({ length: 120 }, (_, i) => `+const line_${i} = ${i};`).join('\n');
      const largeDiff = `diff --git a/large.ts b/large.ts
--- a/large.ts
+++ b/large.ts
@@ -0,0 +1,120 @@
${lines}
`;
      render(React.createElement(DiffViewer, { diff: largeDiff }));
      expect(screen.getByTestId('diff-view-unified')).toBeDefined();
      expect(screen.getByText('+120')).toBeDefined();
    });
  });
});
