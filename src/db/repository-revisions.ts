/**
 * Block lifecycle outside the live document: revision history (the
 * undo-snapshots persisted alongside each block), the soft-delete /
 * restore pair, and the deleted-blocks query that powers the Graveyard.
 */

import type { Block, UUID } from '@/types';
import { getDb, type BlockRevisionRow, type BlockRow } from './connection';
import { db } from './_repo-internal';
import { logDbError } from './errors';
import { rowToBlock } from './repository-rows';

export interface BlockRevision {
  blockId: UUID;
  documentId: UUID;
  content: string;
  snapshotAt: string;
}

const REVISION_CAP = 50;

function revisionId(blockId: UUID, snapshotAt: string): string {
  return `${blockId}|${snapshotAt}`;
}

export async function saveRevision(entry: BlockRevision): Promise<void> {
  try {
    const d = await db();
    const existing = await d.blockRevisions.getAllByBlock(entry.blockId);
    // Dedup: if the latest revision has identical content, skip the write.
    if (existing.length > 0) {
      existing.sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at));
      const last = existing[existing.length - 1];
      if (last.content === entry.content) return;
    }
    const row: BlockRevisionRow = {
      id: revisionId(entry.blockId, entry.snapshotAt),
      block_id: entry.blockId,
      document_id: entry.documentId,
      content: entry.content,
      snapshot_at: entry.snapshotAt,
    };
    await d.blockRevisions.put(row);
    // Trim: keep only the most recent REVISION_CAP entries.
    const all = [...existing, row].sort((a, b) =>
      a.snapshot_at.localeCompare(b.snapshot_at),
    );
    const excess = all.length - REVISION_CAP;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        await d.blockRevisions.delete(all[i].id);
      }
    }
  } catch (err) {
    logDbError('repository.saveRevision', err);
    throw err;
  }
}

export async function loadRevisions(blockId: UUID): Promise<BlockRevision[]> {
  try {
    const d = await db();
    const rows = await d.blockRevisions.getAllByBlock(blockId);
    rows.sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at));
    return rows.map((r) => ({
      blockId: r.block_id,
      documentId: r.document_id,
      content: r.content,
      snapshotAt: r.snapshot_at,
    }));
  } catch (err) {
    logDbError('repository.loadRevisions', err);
    throw err;
  }
}

/**
 * Batched lookup used by the graveyard's enrich pass: the latest non-empty
 * revision content for each requested block, resolved over the `by_block`
 * index inside ONE readonly transaction (the per-block `loadRevisions`
 * loop opened one transaction per deleted block).
 *
 * Blocks with no non-empty revision are simply absent from the result map.
 *
 * NOTE: bypasses the DbLike test-injection layer because it needs a real
 * transaction; test setup must use fake-indexeddb.
 */
export async function loadLatestNonEmptyRevisionContent(
  blockIds: UUID[],
): Promise<Map<UUID, string>> {
  const out = new Map<UUID, string>();
  if (blockIds.length === 0) return out;
  try {
    const idb = await getDb();
    const tx = idb.transaction('block_revisions', 'readonly');
    const index = tx.store.index('by_block');
    const perBlock = await Promise.all(blockIds.map((id) => index.getAll(id)));
    await tx.done;
    blockIds.forEach((id, i) => {
      let latest: BlockRevisionRow | null = null;
      for (const row of perBlock[i]) {
        if (row.content.trim().length === 0) continue;
        if (!latest || row.snapshot_at.localeCompare(latest.snapshot_at) > 0) {
          latest = row;
        }
      }
      if (latest) out.set(id, latest.content);
    });
    return out;
  } catch (err) {
    logDbError('repository.loadLatestNonEmptyRevisionContent', err);
    throw err;
  }
}

export async function loadDeletedBlocks(documentId: UUID): Promise<Block[]> {
  try {
    const d = await db();
    const rows = await d.blocks.getAllByDocument(documentId);
    return rows
      .filter((r) => r.deleted_at !== null)
      .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''))
      .map(rowToBlock);
  } catch (err) {
    logDbError('repository.loadDeletedBlocks', err);
    throw err;
  }
}

export async function restoreBlock(
  blockId: UUID,
  documentId: UUID,
): Promise<Block | null> {
  try {
    const d = await db();
    const rows = await d.blocks.getAllByDocument(documentId);
    const row = rows.find((r) => r.id === blockId);
    if (!row || row.deleted_at === null) return null;
    const now = new Date().toISOString();
    const restored: BlockRow = {
      ...row,
      deleted_at: null,
      deleted_from: null,
      updated_at: now,
    };
    await d.blocks.put(restored);
    return rowToBlock(restored);
  } catch (err) {
    logDbError('repository.restoreBlock', err);
    throw err;
  }
}

export async function softDeleteBlock(
  blockId: UUID,
  deletedFrom: NonNullable<Block['deleted_from']>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const d = await db();
    await d.blocks.softDelete(blockId, now, deletedFrom);
  } catch (err) {
    logDbError('repository.softDeleteBlock', err);
    throw err;
  }
}
