import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useGitStore } from '../../store/gitStore';
import { invoke } from '@tauri-apps/api/core';

export interface EmbeddedTerminalProps {
  className?: string;
  onCommandRun?: (command: string) => void;
}

const DARK_THEME = {
  background: '#0f172a',
  foreground: '#f8fafc',
  cursor: '#38bdf8',
  selectionBackground: '#334155',
  black: '#0f172a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#ec4899',
  cyan: '#06b6d4',
  white: '#f8fafc',
};

const LIGHT_THEME = {
  background: '#f8fafc',
  foreground: '#0f172a',
  cursor: '#0284c7',
  selectionBackground: '#cbd5e1',
  black: '#0f172a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#db2777',
  cyan: '#0891b2',
  white: '#ffffff',
};

export function EmbeddedTerminal({ className = '', onCommandRun }: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const theme = useGitStore((state) => state.theme);
  const repoInfo = useGitStore((state) => state.repoInfo);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      convertEol: true,
      rows: 10,
    });
    termRef.current = term;

    try {
      term.open(containerRef.current);
    } catch {
      // In headless test environments lacking canvas/window APIs, handle gracefully
    }

    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    if (isTauri) {
      const cwd = repoInfo?.path || '.';
      void (async () => {
        try {
          const sid = await invoke<number>('create_pty_session', {
            cwd,
            cols: term.cols,
            rows: term.rows,
          });
          if (disposed) {
            void invoke('close_pty_session', { sessionId: sid });
            return;
          }
          sessionIdRef.current = sid;

          term.onData((data) => {
            const bytes = Array.from(new TextEncoder().encode(data));
            void invoke('write_to_pty', { sessionId: sid, data: bytes });
          });

          term.onResize(({ cols, rows }) => {
            void invoke('resize_pty', { sessionId: sid, cols, rows });
          });

          pollInterval = setInterval(async () => {
            if (disposed || sessionIdRef.current === null) return;
            try {
              const chunk = await invoke<number[]>('read_from_pty', { sessionId: sid });
              if (chunk && chunk.length > 0) {
                const text = new TextDecoder().decode(new Uint8Array(chunk));
                term.write(text);
              }
            } catch {
              // Silently ignore poll errors on shutdown
            }
          }, 50);
        } catch {
          // If Tauri PTY fails or is unimplemented, fall back to interactive mock terminal
          initInteractiveMock(term, onCommandRun);
        }
      })();
    } else {
      initInteractiveMock(term, onCommandRun);
    }

    return () => {
      disposed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (sessionIdRef.current !== null && isTauri) {
        void invoke('close_pty_session', { sessionId: sessionIdRef.current });
        sessionIdRef.current = null;
      }
      try {
        term.dispose();
      } catch {
        // Safe disposal
      }
      termRef.current = null;
    };
  }, [repoInfo?.path, onCommandRun]);

  // Handle dynamic theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    }
  }, [theme]);

  return (
    <div
      data-testid="embedded-terminal"
      className={`w-full h-full bg-slate-950 p-2 font-mono text-xs overflow-hidden ${className}`}
    >
      <div ref={containerRef} data-testid="xterm-container" className="w-full h-full" />
    </div>
  );
}

function initInteractiveMock(term: Terminal, onCommandRun?: (command: string) => void) {
  try {
    term.writeln('\x1b[32mGitShow Interactive CLI Bridge\x1b[0m (Browser Mode)');
    term.writeln('Type git commands to preview, or run GitShow desktop app for full PTY.');
    term.write('$ ');

    let inputBuffer = '';

    term.onData((data) => {
      if (data === '\r') {
        term.writeln('');
        const trimmed = inputBuffer.trim();
        if (trimmed) {
          useGitStore.getState().setCliPreview(trimmed);
          if (onCommandRun) onCommandRun(trimmed);

          if (trimmed === 'git status') {
            term.writeln('On branch main\nYour branch is up to date with \'origin/main\'.\nnothing to commit, working tree clean');
          } else if (trimmed === 'clear') {
            term.clear();
          } else {
            term.writeln(`\x1b[90m[simulated] ${trimmed}\x1b[0m`);
          }
        }
        inputBuffer = '';
        term.write('$ ');
      } else if (data === '\u007F' || data === '\b') {
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data >= ' ' || data === '\t') {
        inputBuffer += data;
        term.write(data);
      }
    });
  } catch {
    // Graceful for environments without terminal stream
  }
}

export default EmbeddedTerminal;
