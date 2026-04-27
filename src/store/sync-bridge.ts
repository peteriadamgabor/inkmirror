/**
 * Seam between the sync engine and the store/db layer.
 *
 * The sync engine only speaks `Uint8Array` — it neither knows about IDB
 * nor about Solid stores. This module translates:
 *
 *   - `buildSyncBundleForDocument`  — IDB → SyncBundle bytes (upload path)
 *   - `applySyncBundleToDocument`   — SyncBundle bytes → IDB (download/merge path)
 *   - `getDocLastSyncRevision`      — read last_sync_revision from IDB
 *   - `setDocLastSyncRevision`      — write last_sync_revision to IDB
 *
 * Layering: this file sits in `store/` so it can be imported by `index.tsx`
 * without violating the `ui/ → store/` rule. It calls `@/db/` directly
 * (permitted for `store/` layer) but never touches Solid reactivity.
 */

import { getDb } from '@/db/connection';
import {
  saveDocument,
  saveChapter,
  saveBlock,
  saveCharacter,
  saveSentiment,
  type SentimentEntry,
} from '@/db/repository';
import {
  rowToDocument,
  rowToCharacter,
  rowToChapter,
  rowToBlock,
} from '@/db/repository-rows';
import { serializeForSync, parseFromSync, type SyncBundle } from '@/sync/format';
import type { Block, Chapter, Character, Document, UUID } from '@/types';

// ─── read side ────────────────────────────────────────────────────────────────

/**
 * Read the document's current content from IDB and return it as the
 * encrypted-ready `Uint8Array` that the sync engine will encrypt and upload.
 *
 * Includes ALL blocks (live + soft-deleted) so the graveyard travels with
 * the document, matching what the backup export does.
 * Does NOT include block_revisions — undo history is local-only.
 */
export async function buildSyncBundleForDocument(docId: UUID): Promise<Uint8Array> {
  const idb = await getDb();

  const docRow = await idb.get('documents', docId);
  if (!docRow) throw new Error(`sync-bridge: document ${docId} not found`);

  const [chapterRows, blockRows, characterRows, sentimentRows] = await Promise.all([
    idb.getAllFromIndex('chapters', 'by_document', docId),
    idb.getAllFromIndex('blocks', 'by_document', docId),
    idb.getAllFromIndex('characters', 'by_document', docId),
    idb.getAllFromIndex('sentiments', 'by_document', docId),
  ]);

  const bundle: SyncBundle = {
    payloadVersion: 1,
    document: {
      id: docRow.id,
      title: docRow.title,
      created_at: docRow.created_at,
      updated_at: docRow.updated_at,
    },
    chapters: chapterRows
      .sort((a, b) => a.order_idx - b.order_idx)
      .map((r) => ({
        id: r.id,
        document_id: r.document_id,
        title: r.title,
        order_idx: r.order_idx,
        kind: r.kind,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    blocks: blockRows
      .sort((a, b) => a.order_idx - b.order_idx)
      .map((r) => ({
        id: r.id,
        document_id: r.document_id,
        chapter_id: r.chapter_id,
        type: r.type,
        content: r.content,
        marks: r.marks,
        order_idx: r.order_idx,
        metadata: r.metadata,
        deleted_at: r.deleted_at,
        deleted_from: r.deleted_from,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    characters: characterRows.map((r) => ({
      id: r.id,
      document_id: r.document_id,
      name: r.name,
      aliases: r.aliases,
      notes: r.notes,
      color: r.color,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    sentiments: sentimentRows.map((r) => ({
      block_id: r.block_id,
      document_id: r.document_id,
      label: r.label,
      score: r.score,
      content_hash: r.content_hash,
      analyzed_at: r.analyzed_at,
      source: r.source,
    })),
  };

  return serializeForSync(bundle);
}

// ─── write side ───────────────────────────────────────────────────────────────

/**
 * Parse the bytes coming from the server and overwrite the local document
 * state in IDB (replace strategy: delete-then-insert so stale rows are
 * never left behind).
 *
 * Safety contract:
 * - The document row is updated (title, updated_at) but never deleted so
 *   IDB foreign-key-like references stay intact.
 * - block_revisions are NOT touched — undo history is local-only.
 * - sync_enabled / last_sync_revision / last_synced_at are NOT overwritten
 *   — those are device-local sync metadata.
 */
export async function applySyncBundleToDocument(
  docId: UUID,
  bytes: Uint8Array,
): Promise<void> {
  const bundle = parseFromSync(bytes);

  const idb = await getDb();

  // ── 1. Chapters: delete existing, insert from bundle ──────────────────────
  const existingChapters = await idb.getAllFromIndex('chapters', 'by_document', docId);
  for (const row of existingChapters) {
    await idb.delete('chapters', row.id);
  }
  for (const raw of bundle.chapters) {
    const r = raw as {
      id: string; document_id: string; title: string; order_idx: number;
      kind?: string; created_at: string; updated_at: string;
    };
    const chapter: Chapter = rowToChapter(r);
    await saveChapter(chapter);
  }

  // ── 2. Blocks: delete existing, insert from bundle (NO block_revisions) ───
  const existingBlocks = await idb.getAllFromIndex('blocks', 'by_document', docId);
  for (const row of existingBlocks) {
    // Delete associated sentiments first (FK-like cleanup)
    await idb.delete('blocks', row.id);
  }
  for (const raw of bundle.blocks) {
    const r = raw as {
      id: string; document_id: string; chapter_id: string; type: string;
      content: string; marks?: unknown; order_idx: number; metadata: unknown;
      deleted_at: string | null; deleted_from: unknown | null;
      created_at: string; updated_at: string;
    };
    const block: Block = rowToBlock({
      id: r.id,
      document_id: r.document_id ?? docId,
      chapter_id: r.chapter_id,
      type: r.type,
      content: r.content,
      marks: r.marks,
      order_idx: r.order_idx,
      metadata: r.metadata,
      deleted_at: r.deleted_at,
      deleted_from: r.deleted_from,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
    await saveBlock(block, docId);
  }

  // ── 3. Characters: delete existing, insert from bundle ────────────────────
  const existingCharacters = await idb.getAllFromIndex('characters', 'by_document', docId);
  for (const row of existingCharacters) {
    await idb.delete('characters', row.id);
  }
  for (const raw of bundle.characters) {
    const r = raw as {
      id: string; document_id: string; name: string; aliases: string[];
      notes: string; color: string; description?: string;
      created_at: string; updated_at: string;
    };
    const character: Character = rowToCharacter(r);
    await saveCharacter(character);
  }

  // ── 4. Sentiments: delete existing, insert from bundle ────────────────────
  const existingSentiments = await idb.getAllFromIndex('sentiments', 'by_document', docId);
  for (const row of existingSentiments) {
    await idb.delete('sentiments', row.block_id);
  }
  for (const raw of bundle.sentiments) {
    const r = raw as {
      block_id: string; document_id?: string; label: string; score: number;
      content_hash: string; analyzed_at: string; source?: 'light' | 'deep';
    };
    const entry: SentimentEntry = {
      blockId: r.block_id,
      label: r.label,
      score: r.score,
      contentHash: r.content_hash,
      analyzedAt: r.analyzed_at,
      source: r.source,
    };
    await saveSentiment(docId, entry);
  }

  // ── 5. Document row: patch title + updated_at, preserve sync metadata ─────
  const existingRow = await idb.get('documents', docId);
  if (existingRow) {
    const doc: Document = rowToDocument(existingRow);
    const updatedDoc: Document = {
      ...doc,
      title: bundle.document.title,
      updated_at: bundle.document.updated_at,
    };
    await saveDocument(updatedDoc);
  }
}

// ─── last-revision helpers ────────────────────────────────────────────────────

/**
 * Read the persisted `last_sync_revision` from the document row.
 * Returns 0 if the document doesn't exist (safe default — the engine
 * will treat it as needing a full sync).
 *
 * SYNC — this must be synchronous per the engine's `StartSyncOptions`
 * contract. We keep a tiny in-memory cache that is populated at boot
 * by `preloadSyncRevisions` so we never block the main thread.
 */
const _revCache = new Map<UUID, number>();

export function preloadSyncRevisions(rows: ReadonlyArray<{ id: UUID; last_sync_revision: number }>): void {
  for (const row of rows) {
    _revCache.set(row.id, row.last_sync_revision);
  }
}

export function getDocLastSyncRevision(docId: UUID): number {
  return _revCache.get(docId) ?? 0;
}

export async function setDocLastSyncRevision(docId: UUID, revision: number): Promise<void> {
  _revCache.set(docId, revision);
  const idb = await getDb();
  const row = await idb.get('documents', docId);
  if (!row) return;
  await idb.put('documents', { ...row, last_sync_revision: revision });
}
