import type {
  Block,
  Chapter,
  Character,
  DialogueMetadata,
  DialogueStyle,
  Document,
  Mark,
} from '@/types';
import { DEFAULT_DIALOGUE_STYLE } from '@/types';
import { normalizeMarks } from '@/engine/marks';

/**
 * Resolve a dialogue block's speaker to a display name. Returns null
 * when no speaker is assigned. Shared by every exporter — historically
 * this lived as a copy in each file.
 */
export function speakerNameFor(
  data: DialogueMetadata,
  characters: readonly Character[],
): string | null {
  if (!data.speaker_id) return null;
  return characters.find((c) => c.id === data.speaker_id)?.name ?? null;
}

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

const LAST_EXPORT_KEY = 'inkmirror.lastExportAt';

export function recordExportTimestamp(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  }
}

export function daysSinceLastExport(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LAST_EXPORT_KEY);
  if (!raw) return null;
  const ms = Date.now() - new Date(raw).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Resolve a document's dialogue style, falling back to the default for
 * older documents stored before the setting existed.
 */
export function resolveDialogueStyle(document: Document): DialogueStyle {
  return document.settings.dialogue_style ?? DEFAULT_DIALOGUE_STYLE;
}

/**
 * Wrap a single dialogue paragraph for prose export according to the
 * document's dialogue style. Newlines inside the content are preserved
 * (soft line breaks); the wrapper is applied once around the whole run.
 *
 * Used by PDF / DOCX / EPUB — Fountain has its own speaker-cue layout
 * and does not call this.
 */
export function formatDialogueProse(
  content: string,
  style: DialogueStyle,
): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  switch (style) {
    case 'curly':
      return `“${trimmed}”`;
    case 'hu_dash':
      // En-dash + NBSP so the dash stays visually attached to the
      // opening word. No closing punctuation — Hungarian convention
      // lets the sentence end naturally with the narrator's prose that
      // follows (which, per the novel-first plan, the writer authors).
      return `– ${trimmed}`;
    case 'straight':
    default:
      return `"${trimmed}"`;
  }
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
  recordExportTimestamp();
  // Quiet, opportunistic ask: a user clicking "download" has just
  // signalled they care about durability — perfect moment to ask the
  // browser to upgrade IDB to persistent storage. `askPersistenceOnce`
  // is idempotent (records the outcome in localStorage), so subsequent
  // exports won't re-ask. Lazy-loaded so the prompt path doesn't bloat
  // the export hot path.
  void import('@/utils/storage')
    .then(({ askPersistenceOnce }) => askPersistenceOnce())
    .catch(() => {
      // No surface for failures here; the badge in Settings → Advanced
      // is the source of truth for the user.
    });
}
