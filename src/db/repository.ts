/**
 * Public IndexedDB facade. Most of the heavy lifting lives in sibling
 * files (`repository-rows`, `repository-revisions`, `repository-inconsistency`,
 * `_repo-internal`); this module keeps the everyday document/chapter/
 * character/sentiment CRUD plus the cross-store loaders, and re-exports
 * the rest so callers can keep using `import * as repo from '@/db/repository'`.
 */

import { getDb } from './connection';
import type {
  Block,
  Chapter,
  Character,
  Document,
  UUID,
  InconsistencyFlag,
} from '@/types';
import type { SentimentRow } from './connection';
import { db } from './_repo-internal';
import { logDbError } from './errors';
import {
  blockToRow,
  chapterToRow,
  characterToRow,
  documentToRow,
  rowToBlock,
  rowToChapter,
  rowToCharacter,
  rowToDocument,
} from './repository-rows';
import {
  loadInconsistencyFlagsByDocument,
} from './repository-inconsistency';

// Re-exports so existing `import * as repo from '@/db/repository'` callers
// keep working without touching every consumer.
export { __setTestDb, type DbLike } from './_repo-internal';
export {
  type BlockRevision,
  saveRevision,
  loadRevisions,
  loadDeletedBlocks,
  restoreBlock,
  softDeleteBlock,
} from './repository-revisions';
export {
  saveInconsistencyFlag,
  loadInconsistencyFlagsByDocument,
  loadInconsistencyFlagsByCharacter,
  loadInconsistencyFlagsByBlock,
  deleteInconsistencyFlag,
  setInconsistencyFlagStatus,
} from './repository-inconsistency';

export interface SentimentEntry {
  blockId: UUID;
  label: string;
  score: number;
  contentHash: string;
  analyzedAt: string;
  source?: 'light' | 'deep';
}

export async function saveDocument(doc: Document): Promise<void> {
  try {
    const d = await db();
    await d.documents.put(documentToRow(doc));
  } catch (err) {
    logDbError('repository.saveDocument', err);
    throw err;
  }
}

export async function deleteChapterRow(id: UUID): Promise<void> {
  try {
    const d = await db();
    await d.chapters.delete(id);
  } catch (err) {
    logDbError('repository.deleteChapterRow', err);
    throw err;
  }
}

/**
 * When a chapter is hard-deleted, soft-deleted blocks (graveyard) whose
 * live `chapter_id` still pointed at it would otherwise be left dangling
 * — exports include them by document_id, but their phantom chapter is
 * gone, and any consumer that walks `chapter_id` ends up with a broken
 * reference. Re-point those rows to a surviving chapter so the on-disk
 * invariant "every block.chapter_id refers to an existing chapter" holds.
 *
 * `deleted_from.chapter_id` is preserved untouched — that is the audit
 * trail the graveyard UI shows the user.
 */
export async function repointDeletedBlocksForDeletedChapter(
  documentId: UUID,
  deletedChapterId: UUID,
  fallbackChapterId: UUID,
): Promise<void> {
  if (deletedChapterId === fallbackChapterId) return;
  try {
    const idb = await getDb();
    const now = new Date().toISOString();
    // Single transaction: atomic and one IDB round per row instead of a
    // serialized one-transaction-per-put loop.
    const tx = idb.transaction('blocks', 'readwrite');
    const rows = await tx.store.index('by_document').getAll(documentId);
    await Promise.all(
      rows
        .filter((row) => row.deleted_at !== null && row.chapter_id === deletedChapterId)
        .map((row) => {
          row.chapter_id = fallbackChapterId;
          row.updated_at = now;
          return tx.store.put(row);
        }),
    );
    await tx.done;
  } catch (err) {
    logDbError('repository.repointDeletedBlocksForDeletedChapter', err);
    throw err;
  }
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  try {
    const d = await db();
    await d.chapters.put(chapterToRow(chapter));
  } catch (err) {
    logDbError('repository.saveChapter', err);
    throw err;
  }
}

export async function saveBlock(block: Block, documentId: UUID): Promise<void> {
  try {
    const d = await db();
    await d.blocks.put(blockToRow(block, documentId));
  } catch (err) {
    logDbError('repository.saveBlock', err);
    throw err;
  }
}

export async function listDocuments(): Promise<Document[]> {
  try {
    const d = await db();
    const rows = await d.documents.getAll();
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows.map(rowToDocument);
  } catch (err) {
    logDbError('repository.listDocuments', err);
    throw err;
  }
}

export async function listDocumentRows(): Promise<import('./connection').DocumentRow[]> {
  try {
    const d = await db();
    const rows = await d.documents.getAll();
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows;
  } catch (err) {
    logDbError('repository.listDocumentRows', err);
    throw err;
  }
}

/**
 * Title equality used by uniqueness checks. Trimmed and case-folded so
 * "MyTest", "mytest", and "MyTest " are treated as the same name. Internal
 * whitespace is preserved so "My Test" and "My  Test" stay distinct.
 */
function normalizeTitle(s: string): string {
  return s.trim().toLocaleLowerCase();
}

/**
 * Whether another document already uses this title. `excludeDocId` lets the
 * caller skip the document being renamed (so editing a doc back to its own
 * current title doesn't false-positive).
 */
export async function isTitleTaken(
  title: string,
  excludeDocId?: UUID,
): Promise<boolean> {
  try {
    const d = await db();
    const rows = await d.documents.getAll();
    const target = normalizeTitle(title);
    return rows.some(
      (r) => r.id !== excludeDocId && normalizeTitle(r.title) === target,
    );
  } catch (err) {
    logDbError('repository.isTitleTaken', err);
    throw err;
  }
}

/**
 * Return `title` if it's free, otherwise `title (2)`, `title (3)`, … until
 * a free name is found. Used on sync-pull and backup-import where blocking
 * isn't an option but a silent collision would be confusing.
 */
export async function disambiguateTitle(title: string): Promise<string> {
  if (!(await isTitleTaken(title))) return title;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${title} (${n})`;
    if (!(await isTitleTaken(candidate))) return candidate;
  }
  // Pathological: 10k collisions. Fall through to a uuid suffix so we
  // never return something that's still taken.
  return `${title} (${crypto.randomUUID().slice(0, 8)})`;
}

/**
 * Patch only the `sync_enabled` flag on a document row, preserving every
 * other field. Used by the Sync settings tab and DocumentSettings sync toggle.
 * We cannot go through `saveDocument` because `documentToRow` hardcodes
 * `sync_enabled: false` (it doesn't carry the flag on the domain type).
 */
export async function setSyncEnabled(docId: UUID, enabled: boolean): Promise<void> {
  try {
    const d = await db();
    const row = await d.documents.get(docId);
    if (!row) return;
    await d.documents.put({ ...row, sync_enabled: enabled });
  } catch (err) {
    logDbError('repository.setSyncEnabled', err);
    throw err;
  }
}

export async function saveSentiment(
  documentId: UUID,
  entry: SentimentEntry,
): Promise<void> {
  try {
    const row: SentimentRow = {
      block_id: entry.blockId,
      document_id: documentId,
      label: entry.label,
      score: entry.score,
      content_hash: entry.contentHash,
      analyzed_at: entry.analyzedAt,
      source: entry.source,
    };
    const d = await db();
    await d.sentiments.put(row);
  } catch (err) {
    logDbError('repository.saveSentiment', err);
    throw err;
  }
}

export async function loadSentiments(documentId: UUID): Promise<SentimentEntry[]> {
  try {
    const d = await db();
    const rows = await d.sentiments.getAllByDocument(documentId);
    return rows.map((r) => ({
      blockId: r.block_id,
      label: r.label,
      score: r.score,
      contentHash: r.content_hash,
      analyzedAt: r.analyzed_at,
      source: r.source ?? 'light',
    }));
  } catch (err) {
    logDbError('repository.loadSentiments', err);
    throw err;
  }
}

export async function saveCharacter(character: Character): Promise<void> {
  try {
    const d = await db();
    await d.characters.put(characterToRow(character));
  } catch (err) {
    logDbError('repository.saveCharacter', err);
    throw err;
  }
}

export async function deleteCharacter(id: UUID): Promise<void> {
  try {
    const d = await db();
    await d.characters.delete(id);
  } catch (err) {
    logDbError('repository.deleteCharacter', err);
    throw err;
  }
}

export async function loadCharacters(documentId: UUID): Promise<Character[]> {
  try {
    const d = await db();
    const rows = await d.characters.getAllByDocument(documentId);
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows.map(rowToCharacter);
  } catch (err) {
    logDbError('repository.loadCharacters', err);
    throw err;
  }
}

export interface LoadedDocument {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
  sentiments: SentimentEntry[];
  characters: Character[];
  inconsistencyFlags: InconsistencyFlag[];
}

/**
 * Delete every row belonging to a document across every object store,
 * including block_revisions. Used by both the DocumentPicker delete
 * flow and the replace-strategy import wipe so they stay consistent.
 *
 * NOTE: bypasses the DbLike test-injection layer because it spans
 * stores; test setup must use the real fake-indexeddb.
 */
export async function deleteDocumentAllRows(documentId: UUID): Promise<void> {
  try {
    const idb = await getDb();
    // One readwrite transaction across every store: the delete is atomic
    // (no half-deleted document if something fails mid-way) and avoids
    // the prior per-row await pattern that serialized hundreds of
    // single-operation transactions on large documents.
    const tx = idb.transaction(
      ['documents', 'chapters', 'blocks', 'block_revisions', 'sentiments', 'characters', 'inconsistencies'],
      'readwrite',
    );
    const blocksStore = tx.objectStore('blocks');
    const revisionsStore = tx.objectStore('block_revisions');
    const chaptersStore = tx.objectStore('chapters');
    const sentimentsStore = tx.objectStore('sentiments');
    const charactersStore = tx.objectStore('characters');
    const inconsistenciesStore = tx.objectStore('inconsistencies');

    const [blockKeys, chapterKeys, sentimentKeys, characterKeys, inconsistencyKeys] =
      await Promise.all([
        blocksStore.index('by_document').getAllKeys(documentId),
        chaptersStore.index('by_document').getAllKeys(documentId),
        sentimentsStore.index('by_document').getAllKeys(documentId),
        charactersStore.index('by_document').getAllKeys(documentId),
        inconsistenciesStore.index('by_document').getAllKeys(documentId),
      ]);

    await Promise.all([
      ...blockKeys.map(async (blockKey) => {
        const revKeys = await revisionsStore.index('by_block').getAllKeys(blockKey);
        await Promise.all(revKeys.map((r) => revisionsStore.delete(r)));
        await blocksStore.delete(blockKey);
      }),
      ...chapterKeys.map((k) => chaptersStore.delete(k)),
      ...sentimentKeys.map((k) => sentimentsStore.delete(k)),
      ...characterKeys.map((k) => charactersStore.delete(k)),
      ...inconsistencyKeys.map((k) => inconsistenciesStore.delete(k)),
      tx.objectStore('documents').delete(documentId),
    ]);
    await tx.done;
  } catch (err) {
    logDbError('repository.deleteDocumentAllRows', err);
    throw err;
  }
}

export async function loadDocument(documentId: UUID): Promise<LoadedDocument | null> {
  try {
    const d = await db();
    const docRow = await d.documents.get(documentId);
    if (!docRow) return null;

    const chapterRows = await d.chapters.getAllByDocument(documentId);
    chapterRows.sort((a, b) => a.order_idx - b.order_idx);

    const blockRows = await d.blocks.getAllByDocument(documentId);
    const visibleBlocks = blockRows
      .filter((r) => r.deleted_at === null)
      .sort((a, b) => a.order_idx - b.order_idx);

    const sentiments = await loadSentiments(documentId);
    const characters = await loadCharacters(documentId);
    const inconsistencyFlags = await loadInconsistencyFlagsByDocument(documentId);

    return {
      document: rowToDocument(docRow),
      chapters: chapterRows.map(rowToChapter),
      blocks: visibleBlocks.map(rowToBlock),
      sentiments,
      characters,
      inconsistencyFlags,
    };
  } catch (err) {
    logDbError('repository.loadDocument', err);
    throw err;
  }
}
