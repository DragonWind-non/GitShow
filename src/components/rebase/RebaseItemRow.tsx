import React from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import type { RebaseAction, RebaseItem } from '../../types/git';

export interface RebaseItemRowProps {
  item: RebaseItem;
  index: number;
  totalItems: number;
  onChangeAction: (index: number, action: RebaseAction) => void;
  onChangeMessage: (index: number, message: string) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
}

const actionStyles: Record<RebaseAction, { badge: string; text: string }> = {
  pick: {
    badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-700/60',
    text: 'text-emerald-400',
  },
  squash: {
    badge: 'bg-purple-950/60 text-purple-400 border-purple-700/60',
    text: 'text-purple-400',
  },
  reword: {
    badge: 'bg-sky-950/60 text-sky-400 border-sky-700/60',
    text: 'text-sky-400',
  },
  drop: {
    badge: 'bg-rose-950/60 text-rose-400 border-rose-700/60',
    text: 'text-rose-400',
  },
  fixup: {
    badge: 'bg-amber-950/60 text-amber-400 border-amber-700/60',
    text: 'text-amber-400',
  },
};

export function RebaseItemRow({
  item,
  index,
  totalItems,
  onChangeAction,
  onChangeMessage,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: RebaseItemRowProps) {
  const isDrop = item.action === 'drop';
  const isReword = item.action === 'reword';
  const shortSha = item.sha.slice(0, 7);

  return (
    <div
      data-testid={`rebase-item-row-${index}`}
      draggable
      onDragStart={(e) => onDragStart?.(e, index)}
      onDragOver={(e) => onDragOver?.(e, index)}
      onDrop={(e) => onDrop?.(e, index)}
      className="flex items-center gap-2.5 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors group"
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-slate-500 group-hover:text-slate-400 p-0.5 rounded transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Action Selector */}
      <select
        value={item.action}
        onChange={(e) => onChangeAction(index, e.target.value as RebaseAction)}
        className={`text-xs font-semibold px-2 py-1 rounded border outline-none cursor-pointer bg-slate-950 ${actionStyles[item.action].badge}`}
        aria-label={`Action for commit ${shortSha}`}
      >
        <option value="pick">pick</option>
        <option value="squash">squash</option>
        <option value="reword">reword</option>
        <option value="drop">drop</option>
        <option value="fixup">fixup</option>
      </select>

      {/* Commit Hash Badge */}
      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 select-all shrink-0">
        {shortSha}
      </span>

      {/* Commit Message: display or edit */}
      <div className="flex-1 min-w-0">
        {isReword ? (
          <input
            type="text"
            value={item.message}
            onChange={(e) => onChangeMessage(index, e.target.value)}
            className="w-full text-xs font-mono bg-slate-950 border border-sky-600 rounded px-2 py-1 text-slate-200 outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Edit commit message..."
          />
        ) : (
          <span
            data-testid={`rebase-item-msg-${index}`}
            className={`text-xs truncate block font-sans ${
              isDrop
                ? 'line-through text-slate-500'
                : 'text-slate-200'
            }`}
            title={item.message}
          >
            {item.message}
          </span>
        )}
      </div>

      {/* Move Controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          data-testid={`move-up-${index}`}
          disabled={index === 0}
          onClick={() => onMoveUp?.(index)}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Move up"
          aria-label={`Move commit ${shortSha} up`}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid={`move-down-${index}`}
          disabled={index === totalItems - 1}
          onClick={() => onMoveDown?.(index)}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Move down"
          aria-label={`Move commit ${shortSha} down`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
