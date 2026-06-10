import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDbForTests, getDb } from '@/db/connection';
import { __setTestDb } from '@/db/repository';
import {
  buildSyncBundleForDocument,
  applySyncBundleToDocument,
} from './sync-bridge';

// Poison hook: lets a test make chapterToRow emit an un-cloneable row so
// the apply transaction fails mid-write (structured clone rejects).
let poisonChapterRows = false;
vi.mock('@/db/repository-rows', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db/repository-rows')>();
  return {
    ...real,
    chapterToRow: (c: Parameters<typeof real.chapterToRow>[0]) => {
      const row = real.chapterToRow(c);
      if (poisonChapterRows) {
        return { ...row, title: (() => {}) as unknown as string };
      }
      return row;
    },
  };
});

async function resetDb(): Promise<void> {
  __setTestDb(null);
  try {
    const existing = await getDb();
    existing.close();
  } catch {
    // first run — nothing to close
  }
  __resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('inkmirror');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

const NOW = new Date('2026-06-10T12:00:00.000Z').toISOString();

async function seed(docId = 'doc-1'): Promise<void> {
  const db = await getDb();
  await db.put('documents', {
    id: docId,
    title: 'Synced Novel',
    author: 'Ada',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: NOW,
    updated_at: NOW,
    sync_enabled: true,
    last_sync_revision: 3,
    last_synced_at: 123,
  });
  await db.put('chapters', {
    id: 'chap-1',
    document_id: docId,
    title: 'Chapter 1',
    order_idx: 0,
    kind: 'standard',
    created_at: NOW,
    updated_at: NOW,
  });
  await db.put('blocks', {
    id: 'blk-1',
    document_id: docId,
    chapter_id: 'chap-1',
    type: 'text',
    content: 'Original line.',
    order_idx: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: NOW,
    updated_at: NOW,
  });
}

describe('applySyncBundleToDocument', () => {
  beforeEach(async () => {
    poisonChapterRows = false;
    await resetDb();
  });

  it('first pull creates the document with sync_enabled=true', async () => {
    await seed('doc-1');
    const bytes = await buildSyncBundleForDocument('doc-1');
    await resetDb();

    await applySyncBundleToDocument('doc-1', bytes);

    const db = await getDb();
    const doc = await db.get('documents', 'doc-1');
    expect(doc?.title).toBe('Synced Novel');
    expect(doc?.sync_enabled).toBe(true);
    expect((await db.getAllFromIndex('chapters', 'by_document', 'doc-1')).length).toBe(1);
    expect((await db.getAllFromIndex('blocks', 'by_document', 'doc-1')).length).toBe(1);
  });

  it('replaces local rows and removes stale ones, preserving device-local sync metadata', async () => {
    await seed('doc-1');
    const bytes = await buildSyncBundleForDocument('doc-1');

    // Diverge locally: an extra chapter the bundle doesn't know about.
    const db = await getDb();
    await db.put('chapters', {
      id: 'chap-stale',
      document_id: 'doc-1',
      title: 'Stale local chapter',
      order_idx: 1,
      kind: 'standard',
      created_at: NOW,
      updated_at: NOW,
    });

    await applySyncBundleToDocument('doc-1', bytes);

    const chapters = await db.getAllFromIndex('chapters', 'by_document', 'doc-1');
    expect(chapters.map((c) => c.id)).toEqual(['chap-1']);
    const doc = await db.get('documents', 'doc-1');
    // last_sync_revision is device-local — the apply must not clobber it.
    expect(doc?.last_sync_revision).toBe(3);
  });

  it('rolls back completely when a write fails mid-transaction', async () => {
    await seed('doc-1');
    const bytes = await buildSyncBundleForDocument('doc-1');
    poisonChapterRows = true;

    await expect(applySyncBundleToDocument('doc-1', bytes)).rejects.toThrow();

    // The delete-then-insert shares one transaction: the local document
    // must survive a failed apply untouched — nothing deleted, nothing half-written.
    const db = await getDb();
    const chapters = await db.getAllFromIndex('chapters', 'by_document', 'doc-1');
    expect(chapters.map((c) => c.title)).toEqual(['Chapter 1']);
    const blocks = await db.getAllFromIndex('blocks', 'by_document', 'doc-1');
    expect(blocks.map((b) => b.content)).toEqual(['Original line.']);
    expect((await db.get('documents', 'doc-1'))?.title).toBe('Synced Novel');
  });
});
