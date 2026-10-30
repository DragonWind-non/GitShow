import React, { useState } from 'react';
import { Plus, Minus, RotateCcw, X } from 'lucide-react';
import type { FileStatus } from '../../types/git';

export interface FileItemProps {
  file: FileStatus;
  isSelected?: boolean;
  onSelect?: (file: FileStatus) => void;
  onStage?: (file: FileStatus) => void;
  onUnstage?: (file: FileStatus) => void;
  onDiscard?: (file: FileStatus) => void;
}

const STATUS_CONFIG: Record<
  FileStatus['status'],
  { label: string; badgeClass: string }
> = {
  modified: {
    label: 'M',
    badgeClass: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  },
  added: {
    label: 'A',
    badgeClass: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  },
  deleted: {
    label: 'D',
    badgeClass: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
  },
  untracked: {
    label: 'U',
    badgeClass: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  },
  renamed: {
    label: 'R',
    badgeClass: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  },
};

export function FileItem({
  file,
  isSelected = false,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: FileItemProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const lastSlashIndex = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'));
  const filename = lastSlashIndex >= 0 ? file.path.slice(lastSlashIndex + 1) : file.path;
  const dir = lastSlashIndex >= 0 ? file.path.slice(0, lastSlashIndex + 1) : '';

  const statusConfig = STATUS_CONFIG[file.status] ?? STATUS_CONFIG.modified;

  return (
    <div
      data-testid={`file-item-${file.path}`}
      onClick={() => onSelect?.(file)}
      className={`group flex items-center gap-2 px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer select-none ${
        isSelected
          ? 'bg-blue-600/20 text-white border border-blue-500/30'
          : 'text-slate-300 hover:bg-slate-800/60'
      }`}
    >
      {/* Status badge */}
      <span
        title={file.status}
        className={`w-4 h-4 flex items-center justify-center text-[10px] font-bold font-mono rounded border shrink-0 ${statusConfig.badgeClass}`}
      >
        {statusConfig.label}
      </span>

      {/* File name & directory path */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-slate-200 truncate">{filename}</div>
        {dir && <div className="text-[10px] font-mono text-slate-500 truncate">{dir}</div>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {confirmingDiscard ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              data-testid={`confirm-discard-${file.path}`}
              onClick={(e) => {
                e.stopPropagation();
                onDiscard?.(file);
                setConfirmingDiscard(false);
              }}
              title="Confirm discard"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
            >
              Confirm
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDiscard(false);
              }}
              title="Cancel"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            {!file.staged && onDiscard && (
              <button
                data-testid={`discard-file-${file.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDiscard(true);
                }}
                title="Discard changes"
                className="p-1 rounded text-slate-400 opacity-80 group-hover:opacity-100 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {file.staged ? (
              <button
                data-testid={`unstage-file-${file.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstage?.(file);
                }}
                title="Unstage file"
                className="p-1 rounded text-slate-400 opacity-80 group-hover:opacity-100 hover:text-amber-300 hover:bg-slate-800 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                data-testid={`stage-file-${file.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onStage?.(file);
                }}
                title="Stage file"
                className="p-1 rounded text-slate-400 opacity-80 group-hover:opacity-100 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FileItem;
