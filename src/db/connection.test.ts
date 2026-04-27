import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, deleteDB } from 'idb';

const TEST_DB = 'inkmirror-test-v7';

beforeEach(async () => {
  await deleteDB(TEST_DB);
});

describe('schema v6 → v7 migration', () => {
  it('adds sync_keys store', async () => {
    // Set up a v6 database manually with the existing stores.
    const v6 = await openDB(TEST_DB, 6, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      },
    });
    await v6.put('documents', { id: 'doc-1', title: 'Test', created_at: '', updated_at: '' });
    v6.close();

    // Open with our v7 connection — it should run the migration.
    const { connectDB } = await import('./connection');
    const db = await connectDB(TEST_DB);
    expect(Array.from(db.objectStoreNames)).toContain('sync_keys');
    db.close();
  });

  it('backfills sync_enabled, last_sync_revision, last_synced_at on existing docs', async () => {
    const v6 = await openDB(TEST_DB, 6, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      },
    });
    await v6.put('documents', {
      id: 'doc-1',
      title: 'Existing doc',
      created_at: '',
      updated_at: '',
    });
    v6.close();

    const { connectDB } = await import('./connection');
    const db = await connectDB(TEST_DB);
    const tx = db.transaction('documents', 'readonly');
    const doc = (await tx.store.get('doc-1')) as unknown as Record<string, unknown>;
    expect(doc.sync_enabled).toBe(false);
    expect(doc.last_sync_revision).toBe(0);
    expect(doc.last_synced_at).toBeNull();
    db.close();
  });

  it('migration is idempotent — re-opening at v7 does not error', async () => {
    const v6 = await openDB(TEST_DB, 6, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      },
    });
    v6.close();

    const { connectDB } = await import('./connection');
    const db1 = await connectDB(TEST_DB);
    db1.close();
    // Opening a second time at the same version should not run upgrade again.
    const db2 = await connectDB(TEST_DB);
    expect(Array.from(db2.objectStoreNames)).toContain('sync_keys');
    db2.close();
  });
});
