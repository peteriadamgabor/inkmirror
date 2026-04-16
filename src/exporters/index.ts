import type { Block, Chapter, Character, Document, Mark } from '@/types';
import { normalizeMarks } from '@/engine/marks';

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Split `content` into a list of non-overlapping runs where each run's
 * text is covered by the same mark set. Shared by every exporter so
 * the mark→rendering translation lives in one place.
 */
export function contentToRuns(content: string, marks: Mark[] | undefined): TextRun[] {
  if (!marks || marks.length === 0) {
    return [{ text: content, bold: false, italic: false }];
  }
  const normalized = normalizeMarks(marks, content.length);
  if (normalized.length === 0) {
    return [{ text: content, bold: false, italic: false }];
  }
  const boundarySet = new Set<number>([0, content.length]);
  for (const m of normalized) {
    boundarySet.add(m.start);
    boundarySet.add(m.end);
  }
  const boundaries = [...boundarySet].sort((a, b) => a - b);
  const runs: TextRun[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    if (from === to) continue;
    const bold = normalized.some((m) => m.type === 'bold' && m.start <= from && m.end >= to);
    const italic = normalized.some((m) => m.type === 'italic' && m.start <= from && m.end >= to);
    runs.push({ text: content.slice(from, to), bold, italic });
  }
  return runs;
}

export interface ExportInput {
  document: Document;
  chapters: Chapter[];
  blocks: Block[]; // live, non-deleted
  characters: Character[];
}

export interface Exporter {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  run(input: ExportInput): Promise<Blob>;
}

export type ExportFormat = 'json' | 'markdown' | 'fountain' | 'epub' | 'docx' | 'pdf';

export function visibleChapterBlocks(
  chapter: Chapter,
  blocks: Block[],
): Block[] {
  return blocks
    .filter((b) => b.chapter_id === chapter.id && b.deleted_at === null)
    .sort((a, b) => a.order - b.order);
}

/** Skip note blocks and soft-deleted blocks for every exporter. */
export function exportableBlocks(
  chapter: Chapter,
  blocks: Block[],
): Block[] {
  return visibleChapterBlocks(chapter, blocks).filter((b) => b.type !== 'note');
}

export function sanitizeFilename(title: string): string {
  const trimmed = title.trim() || 'untitled';
  return trimmed
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

export function textBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: `${mimeType};charset=utf-8` });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
