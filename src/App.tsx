import React from 'react';
import { GitBranch, GitCommit, Settings } from 'lucide-react';

export function App() {
  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      <header className="fixed top-0 left-0 right-0 h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50">
        <div className="flex items-center space-x-2 text-sm font-semibold tracking-wide">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <span>GitShow</span>
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span>Ready</span>
          <Settings className="w-3.5 h-3.5 hover:text-slate-200 cursor-pointer transition-colors" />
        </div>
      </header>

      <main className="flex-1 pt-10 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-slate-900 border border-slate-800 text-emerald-400 mb-2">
            <GitCommit className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">GitShow Studio</h1>
          <p className="text-xs text-slate-400 max-w-sm">
            High-performance desktop Git & GitHub client. Open a repository to begin.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
