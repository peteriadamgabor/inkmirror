import type { Block, Chapter, Character, Document } from '@/types';

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
  run(input: ExportInput): string;
}

export type ExportFormat = 'json' | 'markdown' | 'fountain';

export function visibleChapterBlocks(
  chapter: Chapter,
  blocks: Block[],
): Block[] {
  return blocks
    .filter((b) => b.chapter_id === chapter.id && b.deleted_at === null)
    .sort((a, b) => a.order - b.order);
}

export function sanitizeFilename(title: string): string {
  const trimmed = title.trim() || 'untitled';
  return trimmed
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

export function downloadText(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke until the browser has picked up the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
