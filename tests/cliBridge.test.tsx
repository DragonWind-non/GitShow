import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { CommandBridgeDrawer } from '../src/components/cli-bridge/CommandBridgeDrawer';
import { EmbeddedTerminal } from '../src/components/cli-bridge/EmbeddedTerminal';
import { useGitStore } from '../src/store/gitStore';

describe('Task 15: Realtime CLI Command Bridge & Embedded Terminal', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    // Reset store state
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

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock browser APIs needed by xterm
    if (typeof window !== 'undefined') {
      window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));
      window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    }
  });

  it('renders default "git status" preview when store cliPreview is empty', () => {
    render(<CommandBridgeDrawer />);

    expect(screen.getByTestId('cli-bridge-drawer')).toBeDefined();
    expect(screen.getByTestId('cli-command-text')).toBeDefined();
    expect(screen.getByTestId('cli-command-text').textContent).toContain('git status');
  });

  it('updates CLI preview text dynamically when store cliPreview changes', () => {
    render(<CommandBridgeDrawer />);

    act(() => {
      useGitStore.getState().setCliPreview('git commit -m "feat: login" --amend');
    });

    const commandText = screen.getByTestId('cli-command-text');
    expect(commandText.textContent).toContain('git commit');
    expect(commandText.textContent).toContain('--amend');
  });

  it('copies current command to clipboard and shows copied feedback state', async () => {
    act(() => {
      useGitStore.getState().setCliPreview('git add -A');
    });

    render(<CommandBridgeDrawer />);

    const copyBtn = screen.getByTestId('cli-copy-btn');
    expect(copyBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('git add -A');
    expect(screen.getByText(/copied/i)).toBeDefined();
  });

  it('toggles explanation popover explaining command and flags', () => {
    act(() => {
      useGitStore.getState().setCliPreview('git commit -m "feat: login" --amend');
    });

    render(<CommandBridgeDrawer />);

    // Initially popover is not visible
    expect(screen.queryByTestId('cli-explain-popover')).toBeNull();

    // Click Explain button
    const explainBtn = screen.getByTestId('cli-explain-btn');
    fireEvent.click(explainBtn);

    // Popover is displayed
    const popover = screen.getByTestId('cli-explain-popover');
    expect(popover).toBeDefined();

    // Checks breakdown of git commit and flags
    expect(popover.textContent).toMatch(/git commit/i);
    expect(popover.textContent).toMatch(/amend/i);

    // Clicking again closes popover
    fireEvent.click(explainBtn);
    expect(screen.queryByTestId('cli-explain-popover')).toBeNull();
  });

  it('toggles terminal drawer expansion and mounts EmbeddedTerminal', () => {
    render(<CommandBridgeDrawer />);

    expect(useGitStore.getState().isTerminalOpen).toBe(false);
    expect(screen.queryByTestId('embedded-terminal')).toBeNull();

    // Click terminal toggle
    const terminalToggleBtn = screen.getByTestId('cli-terminal-toggle-btn');
    fireEvent.click(terminalToggleBtn);

    expect(useGitStore.getState().isTerminalOpen).toBe(true);
    expect(screen.getByTestId('embedded-terminal')).toBeDefined();

    // Click again to close
    fireEvent.click(terminalToggleBtn);
    expect(useGitStore.getState().isTerminalOpen).toBe(false);
    expect(screen.queryByTestId('embedded-terminal')).toBeNull();
  });

  it('renders EmbeddedTerminal and cleans up on unmount', () => {
    const { unmount } = render(<EmbeddedTerminal />);
    expect(screen.getByTestId('embedded-terminal')).toBeDefined();
    expect(screen.getByTestId('xterm-container')).toBeDefined();

    // Should cleanly unmount without errors
    unmount();
  });
});
