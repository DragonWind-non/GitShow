export type DiffLineType = 'header' | 'add' | 'delete' | 'context' | 'hunk-header';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string; // e.g. @@ -1,5 +1,6 @@
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  headerLines?: string[];
}

/**
 * Classifies a raw diff line into its DiffLineType.
 */
export function classifyDiffLine(line: string): DiffLineType {
  if (line.startsWith('@@')) return 'hunk-header';
  if (
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file ') ||
    line.startsWith('deleted file ') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ')
  ) {
    return 'header';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'delete';
  if (line.startsWith(' ') || line === '') return 'context';
  return 'header';
}

function cleanPath(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith('a/') || cleaned.startsWith('b/')) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Parses raw Git unified diff text into structured files and hunks with line numbers.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedDiff[] {
  if (!rawDiff || !rawDiff.trim()) return [];

  const lines = rawDiff.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const files: ParsedDiff[] = [];

  let currentFile: ParsedDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let curOldLine = 0;
  let curNewLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect diff --git header
    const diffGitMatch = line.match(/^diff --git\s+(.*?)\s+(.*)$/);
    if (diffGitMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile && currentFile.hunks.length > 0) {
        files.push(currentFile);
      }

      currentFile = {
        oldPath: cleanPath(diffGitMatch[1]),
        newPath: cleanPath(diffGitMatch[2]),
        hunks: [],
        headerLines: [line],
      };
      continue;
    }

    // Detect --- (old path)
    if (line.startsWith('--- ')) {
      const rawOld = line.slice(4).trim();
      if (!currentFile) {
        currentFile = { oldPath: '', newPath: '', hunks: [], headerLines: [] };
      }
      currentFile.oldPath = rawOld === '/dev/null' ? '/dev/null' : cleanPath(rawOld);
      currentFile.headerLines?.push(line);
      continue;
    }

    // Detect +++ (new path)
    if (line.startsWith('+++ ')) {
      const rawNew = line.slice(4).trim();
      if (!currentFile) {
        currentFile = { oldPath: '', newPath: '', hunks: [], headerLines: [] };
      }
      currentFile.newPath = rawNew === '/dev/null' ? '/dev/null' : cleanPath(rawNew);
      currentFile.headerLines?.push(line);
      continue;
    }

    // Detect Hunk header: @@ -oldStart[,oldLines] +newStart[,newLines] @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      if (!currentFile) {
        currentFile = { oldPath: '', newPath: '', hunks: [], headerLines: [] };
      }

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      curOldLine = oldStart;
      curNewLine = newStart;

      currentHunk = {
        header: line.trim(),
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      continue;
    }

    // Lines inside hunk
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          oldLineNumber: undefined,
          newLineNumber: curNewLine++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'delete',
          content: line.slice(1),
          oldLineNumber: curOldLine++,
          newLineNumber: undefined,
        });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: curOldLine++,
          newLineNumber: curNewLine++,
        });
      } else if (line === '') {
        // If it's not the very last trailing line outside hunk
        if (i < lines.length - 1 || currentHunk.lines.length < currentHunk.oldLines + currentHunk.newLines) {
          currentHunk.lines.push({
            type: 'context',
            content: '',
            oldLineNumber: curOldLine++,
            newLineNumber: curNewLine++,
          });
        }
      } else if (line.startsWith('\\')) {
        // e.g. \ No newline at end of file
        currentHunk.lines.push({
          type: 'header',
          content: line,
          oldLineNumber: undefined,
          newLineNumber: undefined,
        });
      } else {
        // Context line that might not have leading space
        currentHunk.lines.push({
          type: 'context',
          content: line,
          oldLineNumber: curOldLine++,
          newLineNumber: curNewLine++,
        });
      }
    } else if (currentFile) {
      currentFile.headerLines?.push(line);
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile && currentFile.hunks.length > 0) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Generates a standalone git patch string for a single hunk so it can be staged via `git apply --cached`.
 */
export function generateHunkPatch(file: ParsedDiff, hunkIndex: number): string {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) return '';

  const gitOld = file.oldPath === '/dev/null' ? file.newPath : file.oldPath;
  const gitNew = file.newPath === '/dev/null' ? file.oldPath : file.newPath;

  const headerOld = file.oldPath === '/dev/null' ? '/dev/null' : `a/${file.oldPath}`;
  const headerNew = file.newPath === '/dev/null' ? '/dev/null' : `b/${file.newPath}`;

  const patchHeader = [
    `diff --git a/${gitOld} b/${gitNew}`,
    `--- ${headerOld}`,
    `+++ ${headerNew}`,
    hunk.header,
  ].join('\n');

  const patchLines = hunk.lines.map((line) => {
    if (line.type === 'add') return `+${line.content}`;
    if (line.type === 'delete') return `-${line.content}`;
    if (line.type === 'context') return ` ${line.content}`;
    return line.content;
  });

  return `${patchHeader}\n${patchLines.join('\n')}\n`;
}
