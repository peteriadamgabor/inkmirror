/**
 * Block lifecycle outside the live document: revision history (the
 * undo-snapshots persisted alongside each block), the soft-delete /
 * restore pair, and the deleted-blocks query that powers the Graveyard.
 */

import type { Block, UUID } from '@/types';
import type { BlockRevisionRow, BlockRow } from './connection';
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
