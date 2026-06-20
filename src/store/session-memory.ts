/**
 * Session memory — a quiet "welcome back" line.
 *
 * On open we snapshot the document's word count and the wall-clock time.
 * On the way out (return to picker, or the tab going hidden) we persist how
 * long the sitting ran, how many words were added, which chapter saw the
 * most of that work, and the last line the writer committed. Next time the
 * same document opens, that record is read back and surfaced as one literary
 * toast — no buttons, no streak, no "well done." The writer is shown, not
 * awarded; it's a bookmark, not a greeting.
 *
 * Everything is per-document and local. The word baseline + open time live
 * in memory for the current sitting; only the resulting record is persisted,
 * under `inkmirror.lastSession.<docId>` (same convention as session notes).
 */

import { store } from './document';
import { allVisibleBlocks } from './selectors';
import { lastSentence } from '@/utils/sentence';
import type { UUID } from '@/types';

const KEY_PREFIX = 'inkmirror.lastSession.';
/** Keep the persisted last line short — it's a bookmark, not a paragraph. */
const LINE_CAP = 140;

export interface SessionRecord {
  /** When the sitting ended (ISO 8601). */
  endedAt: string;
  /** Whole minutes the document was open. */
  durationMin: number;
  /** Words added since open (never negative). */
  wordsAdded: number;
  /** Title of the chapter that saw the most new words, when known. */
  chapterTitle: string | null;
  /** Last sentence the writer committed, trimmed to a snippet. */
  lastLine: string;
}

interface Baseline {
  docId: UUID;
  openedAt: number;
  totalWords: number;
  /** Per-chapter word count at open, for the "mostly in {chapter}" line. */
  perChapter: Map<UUID, number>;
}

let baseline: Baseline | null = null;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Word counts at this instant: total + per chapter (note blocks excluded). */
function snapshotWords(): { total: number; perChapter: Map<UUID, number> } {
  let total = 0;
  const perChapter = new Map<UUID, number>();
  for (const b of allVisibleBlocks()) {
    if (b.type === 'note') continue;
    const words = countWords(b.content);
    total += words;
    perChapter.set(b.chapter_id, (perChapter.get(b.chapter_id) ?? 0) + words);
  }
  return { total, perChapter };
}

/** Begin tracking a sitting. Call right after a document is hydrated. */
export function beginSession(docId: UUID): void {
  const { total, perChapter } = snapshotWords();
  baseline = { docId, openedAt: Date.now(), totalWords: total, perChapter };
}

/** Last sentence of the most recently edited prose block, capped. */
function lastCommittedLine(): string {
  let newest: { at: number; content: string } | null = null;
  for (const b of allVisibleBlocks()) {
    if (b.type === 'note' || !b.content.trim()) continue;
    const at = Date.parse(b.updated_at);
    if (Number.isNaN(at)) continue;
    if (!newest || at > newest.at) newest = { at, content: b.content };
  }
  if (!newest) return '';
  const line = lastSentence(newest.content);
  return line.length > LINE_CAP ? `${line.slice(0, LINE_CAP - 1).trimEnd()}…` : line;
}

/**
 * End the current sitting and persist its record. Safe to call more than
 * once (tab-hidden then return-to-picker) — last write wins. No-op when no
 * sitting is open, when the document changed underneath us, or when nothing
 * worth remembering happened (no new words and no committed line).
 */
export function endSession(): void {
  if (!baseline) return;
  if (store.document?.id !== baseline.docId) return;

  const { total, perChapter } = snapshotWords();
  const wordsAdded = Math.max(0, total - baseline.totalWords);
  const lastLine = lastCommittedLine();
  if (wordsAdded === 0 && !lastLine) return;

  // Chapter with the largest positive word delta this sitting.
  let topChapterId: UUID | null = null;
  let topDelta = 0;
  for (const [chapterId, words] of perChapter) {
    const delta = words - (baseline.perChapter.get(chapterId) ?? 0);
    if (delta > topDelta) {
      topDelta = delta;
      topChapterId = chapterId;
    }
  }
  const chapterTitle =
    topChapterId !== null
      ? store.chapters.find((c) => c.id === topChapterId)?.title ?? null
      : null;

  const record: SessionRecord = {
    endedAt: new Date().toISOString(),
    durationMin: Math.round((Date.now() - baseline.openedAt) / 60_000),
    wordsAdded,
    chapterTitle,
    lastLine,
  };
  persist(baseline.docId, record);
}

function persist(docId: UUID, record: SessionRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_PREFIX + docId, JSON.stringify(record));
  } catch {
    // Quota / privacy mode — session memory is a nicety, never a failure.
  }
}

/** Read the previous sitting's record for a document, if any. */
export function recallLastSession(docId: UUID): SessionRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + docId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionRecord>;
    if (typeof parsed.wordsAdded !== 'number' || typeof parsed.lastLine !== 'string') {
      return null;
    }
    return {
      endedAt: typeof parsed.endedAt === 'string' ? parsed.endedAt : '',
      durationMin: typeof parsed.durationMin === 'number' ? parsed.durationMin : 0,
      wordsAdded: parsed.wordsAdded,
      chapterTitle: typeof parsed.chapterTitle === 'string' ? parsed.chapterTitle : null,
      lastLine: parsed.lastLine,
    };
  } catch {
    return null;
  }
}
