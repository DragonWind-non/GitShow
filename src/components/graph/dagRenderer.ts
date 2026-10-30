import type { DagCommit } from '../../types/git';

export const ROW_HEIGHT = 40;
export const LANE_WIDTH = 20;
export const NODE_RADIUS = 5;
export const START_X = 30;

export const LANE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
];

export function getLaneColor(lane: number): string {
  const index = Math.abs(lane) % LANE_COLORS.length;
  return LANE_COLORS[index];
}

export function getVisibleRange(
  scrollTop: number,
  containerHeight: number,
  totalCount: number,
  buffer = 5
): { startIndex: number; endIndex: number } {
  if (totalCount <= 0 || containerHeight <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const startRow = Math.floor(safeScrollTop / ROW_HEIGHT);
  const endRow = Math.ceil((safeScrollTop + containerHeight) / ROW_HEIGHT);

  const startIndex = Math.max(0, startRow - buffer);
  const endIndex = Math.min(totalCount, endRow + buffer);

  return { startIndex, endIndex };
}

export function hitTestCommit(
  x: number,
  y: number,
  scrollTop: number,
  commits: DagCommit[]
): DagCommit | null {
  if (x < 0 || y < 0) return null;
  const virtualY = y + scrollTop;
  if (virtualY < 0) return null;

  const rowIndex = Math.floor(virtualY / ROW_HEIGHT);
  if (rowIndex >= 0 && rowIndex < commits.length) {
    return commits[rowIndex];
  }
  return null;
}

export function renderDag(
  ctx: CanvasRenderingContext2D,
  commits: DagCommit[],
  startIndex: number,
  endIndex: number,
  selectedCommitId: string | null,
  theme: 'dark' | 'light',
  dpr = 1,
  scrollTop = 0,
  width?: number,
  height?: number
): void {
  if (!ctx) return;

  const canvasWidth = width ?? (ctx.canvas ? ctx.canvas.width / dpr : 800);
  const canvasHeight = height ?? (ctx.canvas ? ctx.canvas.height / dpr : 600);

  ctx.save();
  ctx.scale(dpr, dpr);

  // Background clear and fill
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = theme === 'dark' ? '#020617' : '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (commits.length === 0 || startIndex >= endIndex) {
    ctx.restore();
    return;
  }

  // Calculate layout parameters
  let maxLane = 1;
  for (let i = 0; i < commits.length; i++) {
    if (commits[i].lane > maxLane) {
      maxLane = commits[i].lane;
    }
  }
  const lanesEndX = START_X + (maxLane + 1) * LANE_WIDTH + 16;
  const textStartX = Math.max(120, lanesEndX);

  ctx.save();
  ctx.translate(0, -scrollTop);

  // Row selection background & dividing lines
  for (let i = startIndex; i < endIndex; i++) {
    const commit = commits[i];
    const rowY = i * ROW_HEIGHT;
    const isSelected = commit.id === selectedCommitId;

    if (isSelected) {
      ctx.fillStyle = theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.12)';
      ctx.fillRect(0, rowY, canvasWidth, ROW_HEIGHT);
    }

    ctx.strokeStyle = theme === 'dark' ? 'rgba(30, 41, 59, 0.35)' : 'rgba(226, 232, 240, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rowY + ROW_HEIGHT);
    ctx.lineTo(canvasWidth, rowY + ROW_HEIGHT);
    ctx.stroke();
  }

  // Build commit ID -> row index lookup map
  const commitIndexMap = new Map<string, number>();
  for (let idx = 0; idx < commits.length; idx++) {
    commitIndexMap.set(commits[idx].id, idx);
  }

  // Connection lines (straight for same lane, bezier curves for merge/split)
  const lineStart = Math.max(0, startIndex - 20);
  const lineEnd = Math.min(commits.length, endIndex + 20);

  for (let cIdx = lineStart; cIdx < lineEnd; cIdx++) {
    const child = commits[cIdx];
    const x1 = START_X + child.lane * LANE_WIDTH;
    const y1 = cIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

    for (const parentId of child.parent_ids) {
      const pIdx = commitIndexMap.get(parentId);
      if (pIdx === undefined) continue;

      const parent = commits[pIdx];
      const x2 = START_X + parent.lane * LANE_WIDTH;
      const y2 = pIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      const lineColor = getLaneColor(child.lane === parent.lane ? child.lane : parent.lane);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (x1 === x2) {
        // Straight vertical line for same-lane parent connection
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else {
        // Cubic bezier curve for branch split / merge junction
        const midY = (y1 + y2) / 2;
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
      }
      ctx.stroke();
    }
  }

  // Commit nodes
  for (let i = startIndex; i < endIndex; i++) {
    const commit = commits[i];
    const cx = START_X + commit.lane * LANE_WIDTH;
    const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const isSelected = commit.id === selectedCommitId;

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(cx, cy, NODE_RADIUS + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = getLaneColor(commit.lane);
    ctx.fill();
    ctx.strokeStyle = theme === 'dark' ? '#020617' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // HEAD marker
    if (commit.is_head) {
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  // Commit text (hash, branch/tag badges, summary, author)
  for (let i = startIndex; i < endIndex; i++) {
    const commit = commits[i];
    const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    ctx.textBaseline = 'middle';

    // Monospace short hash
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
    const shortHash = commit.short_id || commit.id.slice(0, 7);
    ctx.fillText(shortHash, textStartX, cy);

    let currentX = textStartX + 68;

    // Branch / Tag pills
    if (commit.branch_names && commit.branch_names.length > 0) {
      for (const branch of commit.branch_names) {
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        const textMetrics = ctx.measureText(branch);
        const pillWidth = textMetrics.width + 12;
        const pillHeight = 18;
        const pillY = cy - pillHeight / 2;

        ctx.fillStyle = commit.is_head ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)';
        ctx.fillRect(currentX, pillY, pillWidth, pillHeight);

        ctx.strokeStyle = commit.is_head ? '#10b981' : '#3b82f6';
        ctx.lineWidth = 1;
        ctx.strokeRect(currentX, pillY, pillWidth, pillHeight);

        ctx.fillStyle = commit.is_head ? '#10b981' : theme === 'dark' ? '#93c5fd' : '#2563eb';
        ctx.fillText(branch, currentX + 6, cy);

        currentX += pillWidth + 8;
      }
    }

    // Commit summary text with truncation
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = theme === 'dark' ? '#f1f5f9' : '#0f172a';

    const maxSummaryWidth = Math.max(50, canvasWidth - currentX - 160);
    let summary = commit.summary;
    if (ctx.measureText(summary).width > maxSummaryWidth) {
      while (summary.length > 3 && ctx.measureText(summary + '...').width > maxSummaryWidth) {
        summary = summary.slice(0, -1);
      }
      summary += '...';
    }
    ctx.fillText(summary, currentX, cy);

    // Author text on the right
    if (canvasWidth > currentX + 220) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = theme === 'dark' ? '#64748b' : '#94a3b8';
      const authorText = commit.author_name;
      const authorWidth = ctx.measureText(authorText).width;
      ctx.fillText(authorText, canvasWidth - authorWidth - 16, cy);
    }
  }

  ctx.restore(); // Undo translate
  ctx.restore(); // Undo scale
}
