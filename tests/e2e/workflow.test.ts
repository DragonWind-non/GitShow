import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { invoke } from '@tauri-apps/api/core';
import { mockIPC } from '@tauri-apps/api/mocks';
import { App, type AppProps } from '../../src/App';
import { useGitStore } from '../../src/store/gitStore';
import type {
  RepoInfo,
  BranchInfo,
  DagCommit,
  UndoSnapshot,
  CliExecutionResult,
} from '../../src/types/git';

describe('Task 19: End-to-End Developer Workflow Integration Test Suite', () => {
  let tempDir: string;
  const snapshotsMap = new Map<string, UndoSnapshot>();

  beforeEach(() => {
    // 1. Create a clean isolated temporary Git repository
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitshow-e2e-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.name', 'GitShow E2E'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.email', 'e2e@gitshow.dev'], { cwd: tempDir });

    // Initial commit
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# GitShow E2E Test Repo\nInitial content\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tempDir });
    execFileSync('git', ['commit', '-m', 'chore: initial commit'], { cwd: tempDir });

    snapshotsMap.clear();

    // 2. Reset Zustand Git store
    act(() => {
      useGitStore.setState({
        repoInfo: null,
        branches: [],
        tags: [],
        stashes: [],
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

    // 3. Register real-git backed mockIPC handler
    mockIPC((cmd, argsRaw) => {
      const args = (argsRaw || {}) as Record<string, unknown>;

      if (cmd === 'open_repository') {
        const targetPath = (args.path || args.repoPath || tempDir) as string;
        try {
          let branch: string | null = null;
          let isDetached = false;
          try {
            branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
              cwd: targetPath,
              encoding: 'utf-8',
            }).trim();
          } catch {
            isDetached = true;
          }

          const statusOut = execFileSync('git', ['status', '--porcelain'], {
            cwd: targetPath,
            encoding: 'utf-8',
          }).trim();
          const isClean = statusOut.length === 0;

          const repoInfo: RepoInfo = {
            path: targetPath,
            current_branch: branch,
            is_detached: isDetached,
            is_clean: isClean,
          };
          return repoInfo;
        } catch (err) {
          throw new Error(`Failed to open repository at ${targetPath}: ${String(err)}`);
        }
      }

      if (cmd === 'list_branches') {
        const targetPath = (args.path || args.repoPath || tempDir) as string;
        try {
          const out = execFileSync(
            'git',
            ['branch', '-a', '--format=%(refname:short)|%(objectname)|%(HEAD)'],
            { cwd: targetPath, encoding: 'utf-8' }
          );
          const lines = out.split('\n').filter((l) => l.trim().length > 0);
          const branches: BranchInfo[] = lines.map((line) => {
            const [name, target_commit, headIndicator] = line.trim().split('|');
            return {
              name: name || '',
              target_commit: target_commit || '',
              is_current: headIndicator === '*',
              is_remote: (name || '').startsWith('origin/'),
            };
          });
          return branches;
        } catch {
          return [];
        }
      }

      if (cmd === 'execute_git_command') {
        const repoPath = (args.repoPath || tempDir) as string;
        const gitArgs = (args.args || []) as string[];
        const proc = spawnSync('git', gitArgs, { cwd: repoPath, encoding: 'utf-8' });
        const res: CliExecutionResult = {
          stdout: proc.stdout || '',
          stderr: proc.stderr || '',
          exit_code: proc.status ?? (proc.error ? 1 : 0),
          preview_command: `git ${gitArgs.join(' ')}`,
        };
        return res;
      }

      if (cmd === 'build_commit_graph') {
        const repoPath = (args.repoPath || tempDir) as string;
        try {
          const out = execFileSync(
            'git',
            ['log', '--format=%H|%h|%s|%an|%ae|%at|%P', '-n', '50'],
            { cwd: repoPath, encoding: 'utf-8' }
          );
          const lines = out.split('\n').filter((l) => l.trim().length > 0);
          const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: repoPath,
            encoding: 'utf-8',
          }).trim();

          const branchOut = execFileSync(
            'git',
            ['branch', '--format=%(refname:short)|%(objectname)'],
            { cwd: repoPath, encoding: 'utf-8' }
          );
          const branchMap: Record<string, string[]> = {};
          branchOut
            .split('\n')
            .filter((l) => l.trim().length > 0)
            .forEach((l) => {
              const [bName, bSha] = l.trim().split('|');
              if (bName && bSha) {
                if (!branchMap[bSha]) branchMap[bSha] = [];
                branchMap[bSha].push(bName);
              }
            });

          const activeLanes: (string | null)[] = [];
          const commits: DagCommit[] = lines.map((line) => {
            const [id, short_id, summary, author_name, author_email, timestampStr, parentStr] =
              line.trim().split('|');
            const parent_ids = parentStr ? parentStr.trim().split(/\s+/).filter(Boolean) : [];

            let lane = activeLanes.indexOf(id);
            if (lane === -1) {
              lane = activeLanes.indexOf(null);
              if (lane === -1) {
                lane = activeLanes.length;
                activeLanes.push(null);
              }
            }

            activeLanes[lane] = parent_ids[0] || null;
            for (let i = 1; i < parent_ids.length; i++) {
              const p = parent_ids[i];
              if (!activeLanes.includes(p)) {
                const emptySlot = activeLanes.indexOf(null);
                if (emptySlot !== -1) {
                  activeLanes[emptySlot] = p;
                } else {
                  activeLanes.push(p);
                }
              }
            }

            return {
              id: id || '',
              short_id: short_id || '',
              summary: summary || '',
              author_name: author_name || '',
              author_email: author_email || '',
              timestamp: parseInt(timestampStr || '0', 10),
              parent_ids,
              lane,
              branch_names: branchMap[id || ''] || [],
              is_head: id === headSha,
            };
          });

          return commits;
        } catch {
          return [];
        }
      }

      if (cmd === 'capture_pre_mutation_snapshot') {
        const repoPath = (args.repoPath || tempDir) as string;
        const action = (args.action || 'manual action') as string;
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: repoPath,
          encoding: 'utf-8',
        }).trim();

        const snapId = `snap-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const snap: UndoSnapshot = {
          id: snapId,
          timestamp: Math.floor(Date.now() / 1000),
          action_name: action,
          pre_head_sha: headSha,
          dangling_stash_sha: null,
          restore_cli_command: `git reset --hard ${headSha}`,
        };
        snapshotsMap.set(snapId, snap);
        return snap;
      }

      if (cmd === 'rollback_snapshot') {
        const repoPath = (args.repoPath || tempDir) as string;
        const snapshotId = args.snapshotId as string;
        const snap = snapshotsMap.get(snapshotId);
        if (!snap) {
          throw new Error(`Snapshot not found: '${snapshotId}'`);
        }
        execFileSync('git', ['reset', '--hard', snap.pre_head_sha], { cwd: repoPath });
        return `Successfully rolled back snapshot ${snap.id} (HEAD: ${snap.pre_head_sha})`;
      }

      if (cmd === 'get_undo_stack') {
        return Array.from(snapshotsMap.values());
      }

      return null;
    });
  });

  afterEach(() => {
    // Clean up temporary repository
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error on Windows
    }
  });

  it('Step 1-5: executes complete developer journey on real git repo with Safe Undo recovery', async () => {
    // --- Step 1: Open temp repo (open_repository) ---
    const repoInfo = await invoke<RepoInfo>('open_repository', { path: tempDir });
    expect(repoInfo.path).toBe(tempDir);
    expect(repoInfo.current_branch).toBe('main');
    expect(repoInfo.is_clean).toBe(true);

    const initialBranches = await invoke<BranchInfo[]>('list_branches', { path: tempDir });
    expect(initialBranches.length).toBeGreaterThanOrEqual(1);
    expect(initialBranches.some((b) => b.name === 'main' && b.is_current)).toBe(true);

    const initialGraph = await invoke<DagCommit[]>('build_commit_graph', { repoPath: tempDir });
    expect(initialGraph.length).toBe(1);
    expect(initialGraph[0].summary).toBe('chore: initial commit');
    expect(initialGraph[0].is_head).toBe(true);

    // --- Step 2: Stage modified files and commit (execute_git_command) ---
    const featureFile = path.join(tempDir, 'feature.ts');
    fs.writeFileSync(featureFile, 'export const greeting = "Hello GitShow";\n');

    const addRes = await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['add', 'feature.ts'],
    });
    expect(addRes.exit_code).toBe(0);

    const commitRes = await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['commit', '-m', 'feat: add greeting feature'],
    });
    expect(commitRes.exit_code).toBe(0);

    const afterCommitInfo = await invoke<RepoInfo>('open_repository', { path: tempDir });
    expect(afterCommitInfo.is_clean).toBe(true);

    // --- Step 3: Create and switch to new branch feature/test ---
    const branchRes = await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['checkout', '-b', 'feature/test'],
    });
    expect(branchRes.exit_code).toBe(0);

    const branchRepoInfo = await invoke<RepoInfo>('open_repository', { path: tempDir });
    expect(branchRepoInfo.current_branch).toBe('feature/test');

    // Add a commit on feature/test branch
    const branchFile = path.join(tempDir, 'feature-test.ts');
    fs.writeFileSync(branchFile, 'export const testFn = () => true;\n');
    await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['add', 'feature-test.ts'],
    });
    await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['commit', '-m', 'feat: branch-specific functionality'],
    });

    // --- Step 4: Perform a merge and inspect DAG graph lane allocation ---
    // Switch back to main
    await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['checkout', 'main'],
    });

    // Make a commit on main to force a 2-parent merge commit
    const mainFile = path.join(tempDir, 'main-update.ts');
    fs.writeFileSync(mainFile, 'export const mainVersion = 1;\n');
    await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['add', 'main-update.ts'],
    });
    await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['commit', '-m', 'chore: main stream update'],
    });

    // Merge feature/test into main with --no-ff
    const mergeRes = await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['merge', '--no-ff', '-m', 'merge: integrate feature/test', 'feature/test'],
    });
    expect(mergeRes.exit_code).toBe(0);

    // Build commit graph and verify topology and lanes
    const mergedGraph = await invoke<DagCommit[]>('build_commit_graph', { repoPath: tempDir });
    expect(mergedGraph.length).toBe(5);

    const mergeCommit = mergedGraph[0];
    expect(mergeCommit.summary).toBe('merge: integrate feature/test');
    expect(mergeCommit.parent_ids.length).toBe(2);
    expect(mergeCommit.lane).toBe(0);

    // Verify lanes are allocated cleanly
    const lanes = mergedGraph.map((c) => c.lane);
    expect(lanes.some((l) => l > 0)).toBe(true);

    // --- Step 5: Perform an unsafe reset --hard and execute 1-Click Safe Undo ---
    const mergeCommitSha = mergeCommit.id;
    expect(fs.existsSync(mainFile)).toBe(true);
    expect(fs.existsSync(branchFile)).toBe(true);

    // 5a. Capture pre-mutation snapshot BEFORE the destructive action
    const snapshot = await invoke<UndoSnapshot>('capture_pre_mutation_snapshot', {
      repoPath: tempDir,
      action: 'git reset --hard HEAD~1',
    });
    expect(snapshot.id).toBeDefined();
    expect(snapshot.pre_head_sha).toBe(mergeCommitSha);

    // 5b. Perform the destructive/unsafe reset --hard
    const unsafeResetRes = await invoke<CliExecutionResult>('execute_git_command', {
      repoPath: tempDir,
      args: ['reset', '--hard', 'HEAD~1'],
    });
    expect(unsafeResetRes.exit_code).toBe(0);

    // Verify that the merge commit is now gone from HEAD
    const damagedHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();
    expect(damagedHeadSha).not.toBe(mergeCommitSha);

    // 5c. Execute 1-Click Safe Undo rollback
    const rollbackRes = await invoke<string>('rollback_snapshot', {
      repoPath: tempDir,
      snapshotId: snapshot.id,
    });
    expect(rollbackRes).toContain('Successfully rolled back snapshot');

    // 5d. Verify complete restoration of code and HEAD
    const restoredHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();
    expect(restoredHeadSha).toBe(mergeCommitSha);
    expect(fs.existsSync(mainFile)).toBe(true);
    expect(fs.existsSync(branchFile)).toBe(true);
    expect(fs.existsSync(featureFile)).toBe(true);
  });

  it('renders App and wires open_repository trigger with Zustand store and UI components', async () => {
    // 1. First render App without initialRepoPath
    const { unmount } = render(React.createElement<AppProps>(App));

    // Verify Open Repository banner, input, and trigger exist
    const input = screen.getByTestId('open-repo-input') as HTMLInputElement;
    const openBtn = screen.getByTestId('open-repo-trigger');
    expect(input).toBeDefined();
    expect(openBtn).toBeDefined();

    // 2. Open repository via user input & click
    fireEvent.change(input, { target: { value: tempDir } });
    fireEvent.click(openBtn);

    // Wait for Zustand store to update
    await waitFor(() => {
      const state = useGitStore.getState();
      expect(state.repoInfo).not.toBeNull();
      expect(state.repoInfo?.path).toBe(tempDir);
      expect(state.branches.length).toBeGreaterThan(0);
      expect(state.commits.length).toBeGreaterThan(0);
    });

    // Verify branch indicator renders
    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1);
    unmount();

    // 3. Reset store and verify initialRepoPath prop works directly
    act(() => {
      useGitStore.setState({
        repoInfo: null,
        branches: [],
        commits: [],
      });
    });

    render(React.createElement<AppProps>(App, { initialRepoPath: tempDir }));
    await waitFor(() => {
      const state = useGitStore.getState();
      expect(state.repoInfo).not.toBeNull();
      expect(state.repoInfo?.path).toBe(tempDir);
    });
    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1);
  });
});
