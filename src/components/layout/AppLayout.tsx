import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DagCanvas } from '../graph/DagCanvas';
import { StagingPanel } from '../staging/StagingPanel';
import { DiffViewer } from '../diff/DiffViewer';
import { CommandBridgeDrawer } from '../cli-bridge/CommandBridgeDrawer';
import { UndoModal } from '../undo/UndoModal';
import { InteractiveRebaseModal } from '../rebase/InteractiveRebaseModal';
import { PrStudio } from '../github/PrStudio';
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
  const selectedFile = useGitStore((state) => state.selectedFile);
  const activeDiff = useGitStore((state) => state.activeDiff);
  const selectFile = useGitStore((state) => state.selectFile);
  const activeView = useGitStore((state) => state.activeView);
  const setActiveView = useGitStore((state) => state.setActiveView);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      <UndoModal
        isOpen={activeView === 'undo'}
        onClose={() => setActiveView('history')}
      />
      <InteractiveRebaseModal
        isOpen={activeView === 'rebase'}
        onClose={() => setActiveView('history')}
      />
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
                {center ?? children ?? (
                  activeView === 'pull-requests' ? (
                    <PrStudio />
                  ) : (
                    <DagCanvas />
                  )
                )}
              </div>
            </main>

            {/* Right Column: Inspector / Staging / Diff */}
            <aside
              data-testid="right-column"
              className={`w-80 shrink-0 h-full border-l border-slate-800 bg-slate-900/40 flex flex-col min-h-0 overflow-hidden ${
                activeView === 'pull-requests' && !right ? 'hidden' : ''
              }`}
            >
              {right ??
                (selectedFile ? (
                  <DiffViewer
                    filePath={selectedFile.path}
                    isStaged={selectedFile.staged}
                    diff={activeDiff ?? undefined}
                    onClose={() => selectFile(null)}
                  />
                ) : (
                  <StagingPanel />
                ))}
            </aside>
          </div>

          {/* Bottom Drawer: CLI / Terminal */}
          <div
            data-testid="bottom-drawer"
            className="shrink-0"
          >
            {bottom ?? <CommandBridgeDrawer />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;
