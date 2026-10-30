import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DagCanvas } from '../graph/DagCanvas';
import { useGitStore } from '../../store/gitStore';

export interface AppLayoutProps {
  sidebar?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  bottom?: React.ReactNode;
  children?: React.ReactNode;
}

export function AppLayout({
  sidebar,
  center,
  right,
  bottom,
  children,
}: AppLayoutProps) {
  const isTerminalOpen = useGitStore((state) => state.isTerminalOpen);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Left Column: Sidebar */}
        <div data-testid="sidebar-column" className="shrink-0 h-full">
          {sidebar ?? <Sidebar />}
        </div>

        {/* Center & Right Workspace */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Main Workspace: Center Stage & Right Inspector */}
          <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
            {/* Center Stage: TopBar + DAG View */}
            <main
              data-testid="center-column"
              className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-950"
            >
              <TopBar />
              <div className="flex-1 min-h-0 overflow-auto">
                {center ?? children ?? <DagCanvas />}
              </div>
            </main>

            {/* Right Column: Inspector / Staging / Diff */}
            <aside
              data-testid="right-column"
              className="w-80 shrink-0 h-full border-l border-slate-800 bg-slate-900/40 flex flex-col min-h-0 overflow-hidden"
            >
              {right ?? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs p-4 text-center">
                  Inspector & Diff View (Tasks 13 & 14)
                </div>
              )}
            </aside>
          </div>

          {/* Bottom Drawer: CLI / Terminal */}
          <div
            data-testid="bottom-drawer"
            className={`border-t border-slate-800 bg-slate-950 transition-all duration-150 overflow-hidden flex flex-col shrink-0 ${
              isTerminalOpen ? 'h-60' : 'h-0 border-t-0'
            }`}
          >
            <div className="h-full min-h-0 overflow-auto">
              {bottom ?? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                  CLI Bridge & Terminal Drawer (Task 15)
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;
