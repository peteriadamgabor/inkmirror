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
import type { DocumentRow, SentimentRow } from '@/db/connection';
import { disambiguateTitle, setSyncEnabled } from '@/db/repository';
import { setEngineDocEnabled } from '@/sync';
import {
  rowToCharacter,
  rowToChapter,
  rowToBlock,
  blockToRow,
  chapterToRow,
  characterToRow,
} from '@/db/repository-rows';
import { serializeForSync, parseFromSync, type SyncBundle } from '@/sync/format';
import type { Block, Chapter, Character, UUID } from '@/types';

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
      author: docRow.author,
      synopsis: docRow.synopsis,
      settings: docRow.settings as Record<string, unknown>,
      pov_character_id: docRow.pov_character_id,
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
 * - If the document row doesn't exist locally yet (first pull on a freshly
 *   paired device), it is CREATED with sync_enabled=true so future edits
 *   on this device push back into the circle.
 * - block_revisions are NOT touched — undo history is local-only.
 * - sync_enabled / last_sync_revision / last_synced_at are NOT overwritten
 *   on existing rows — those are device-local sync metadata.
 */
export async function applySyncBundleToDocument(
  docId: UUID,
  bytes: Uint8Array,
): Promise<void> {
  const bundle = parseFromSync(bytes);

  const idb = await getDb();

  // ── 0. Document row first (so chapter/block FKs are valid even on first pull) ─
  // Direct idb.put — going through saveDocument resets sync_enabled and the
  // last_sync_* fields because documentToRow hardcodes those. We need to
  // preserve them for existing rows and seed sync_enabled=true for new rows.
  const existingRow = await idb.get('documents', docId);
  const FALLBACK_SETTINGS = {
    font_family: 'Georgia, serif',
    font_size: 16,
    line_height: 1.8,
    editor_width: 680,
    theme: 'light',
  };
  const newRow: DocumentRow = existingRow
    ? {
        ...existingRow,
        title: bundle.document.title,
        updated_at: bundle.document.updated_at,
        author: bundle.document.author ?? existingRow.author,
        synopsis: bundle.document.synopsis ?? existingRow.synopsis,
        settings: bundle.document.settings ?? existingRow.settings,
        pov_character_id:
          bundle.document.pov_character_id !== undefined
            ? bundle.document.pov_character_id
            : existingRow.pov_character_id,
      }
    : {
        id: docId,
        // If a different local doc already uses this title, append " (n)"
        // so the picker can disambiguate them. Source-side keeps its
        // original title; only the receiving device renames its copy.
        title: await disambiguateTitle(bundle.document.title),
        author: bundle.document.author ?? '',
        synopsis: bundle.document.synopsis ?? '',
        settings: bundle.document.settings ?? FALLBACK_SETTINGS,
        pov_character_id: bundle.document.pov_character_id ?? null,
        created_at: bundle.document.created_at,
        updated_at: bundle.document.updated_at,
        // Auto-enable on first pull: the user paired this device for sync,
        // so any doc that arrives via sync should also push from here.
        sync_enabled: true,
        last_sync_revision: 0,
        last_synced_at: null,
      };
  // ── 1. Build every replacement row in memory (round-tripped through the
  // domain converters so normalization matches the old save* path) ──────────
  const chapterRows = bundle.chapters.map((raw) => {
    const r = raw as {
      id: string; document_id: string; title: string; order_idx: number;
      kind?: string; created_at: string; updated_at: string;
    };
    const chapter: Chapter = rowToChapter(r);
    return chapterToRow(chapter);
  });

  const blockRows = bundle.blocks.map((raw) => {
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
    return blockToRow(block, docId);
  });

  const characterRows = bundle.characters.map((raw) => {
    const r = raw as {
      id: string; document_id: string; name: string; aliases: string[];
      notes: string; color: string; description?: string;
      created_at: string; updated_at: string;
    };
    const character: Character = rowToCharacter(r);
    return characterToRow(character);
  });

  const sentimentRows: SentimentRow[] = bundle.sentiments.map((raw) => {
    const r = raw as {
      block_id: string; document_id?: string; label: string; score: number;
      content_hash: string; analyzed_at: string; source?: 'light' | 'deep';
    };
    return {
      block_id: r.block_id,
      document_id: docId,
      label: r.label,
      score: r.score,
      content_hash: r.content_hash,
      analyzed_at: r.analyzed_at,
      source: r.source,
    };
  });

  // ── 2. Delete-then-insert in ONE transaction. The old per-row await
  // version could fail after deleting chapters but before inserting the
  // replacements, corrupting the local document; now a failure anywhere
  // rolls everything back (NO block_revisions — undo history is local). ─────
  const tx = idb.transaction(
    ['documents', 'chapters', 'blocks', 'characters', 'sentiments'],
    'readwrite',
  );
  const writes: Promise<unknown>[] = [];
  try {
    const [chapterKeys, blockKeys, characterKeys, sentimentKeys] = await Promise.all([
      tx.objectStore('chapters').index('by_document').getAllKeys(docId),
      tx.objectStore('blocks').index('by_document').getAllKeys(docId),
      tx.objectStore('characters').index('by_document').getAllKeys(docId),
      tx.objectStore('sentiments').index('by_document').getAllKeys(docId),
    ]);
    await Promise.all([
      ...chapterKeys.map((k) => tx.objectStore('chapters').delete(k)),
      ...blockKeys.map((k) => tx.objectStore('blocks').delete(k)),
      ...characterKeys.map((k) => tx.objectStore('characters').delete(k)),
      ...sentimentKeys.map((k) => tx.objectStore('sentiments').delete(k)),
    ]);
    writes.push(tx.objectStore('documents').put(newRow));
    for (const r of chapterRows) writes.push(tx.objectStore('chapters').put(r));
    for (const r of blockRows) writes.push(tx.objectStore('blocks').put(r));
    for (const r of characterRows) writes.push(tx.objectStore('characters').put(r));
    for (const r of sentimentRows) writes.push(tx.objectStore('sentiments').put(r));
    await Promise.all([...writes, tx.done]);
  } catch (err) {
    // Absorb tx.done first (it rejects the moment the abort lands), then
    // abort explicitly — a synchronous put() throw would otherwise let
    // the deletes commit without their replacement inserts.
    tx.done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      /* transaction already aborted or finished */
    }
    await Promise.allSettled(writes);
    throw err;
  }

  // Keep the engine's synchronous gate in step with what we just wrote —
  // a doc arriving on first pull is seeded sync_enabled=true and must be
  // pushable immediately, without waiting for the next boot preload.
  _enabledCache.set(docId, newRow.sync_enabled);
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

// Mirror of each document's sync_enabled flag, kept in memory because the
// engine's gate must be synchronous. Populated at boot, updated by the
// toggle path and by applied pulls. Cache miss = false: new documents are
// created with sync_enabled=false, so an unknown doc must not push.
const _enabledCache = new Map<UUID, boolean>();

export function preloadSyncRevisions(
  rows: ReadonlyArray<{ id: UUID; last_sync_revision: number; sync_enabled: boolean }>,
): void {
  for (const row of rows) {
    _revCache.set(row.id, row.last_sync_revision);
    _enabledCache.set(row.id, row.sync_enabled);
  }
}

export function isDocSyncEnabled(docId: UUID): boolean {
  return _enabledCache.get(docId) ?? false;
}

/**
 * THE single entry point for flipping a document's sync_enabled flag.
 * Persists the row, keeps the engine's synchronous gate in step, and
 * notifies the running engine (ON pushes pending local state, OFF
 * cancels any queued push). The UI toggles previously wrote only the
 * IDB row — the engine never noticed, making the checkbox decorative.
 */
export async function setDocumentSyncEnabled(docId: UUID, enabled: boolean): Promise<void> {
  await setSyncEnabled(docId, enabled);
  _enabledCache.set(docId, enabled);
  setEngineDocEnabled(docId, enabled);
}

export function getDocLastSyncRevision(docId: UUID): number {
  return _revCache.get(docId) ?? 0;
}

export async function setDocLastSyncRevision(docId: UUID, revision: number): Promise<void> {
  _revCache.set(docId, revision);
  const idb = await getDb();
  const row = await idb.get('documents', docId);
  if (!row) return;
  // Stamp last_synced_at on every successful push or pull. Without this the
  // schema field stays null forever and the UI can't display "synced N
  // minutes ago" for the picker / sync settings list.
  await idb.put('documents', {
    ...row,
    last_sync_revision: revision,
    last_synced_at: Date.now(),
  });
}
