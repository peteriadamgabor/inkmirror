import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB } from '../db/connection';
import { saveKeys, loadKeys, wipeKeys, hasKeys } from './keystore';

const TEST_DB = 'inkmirror-keystore-test';
beforeEach(async () => { await deleteDB(TEST_DB); });

describe('sync keystore', () => {
  it('hasKeys returns false on a fresh DB', async () => {
    const db = await connectDB(TEST_DB);
    expect(await hasKeys(db)).toBe(false);
    db.close();
  });

  it('round-trips saved keys', async () => {
    const db = await connectDB(TEST_DB);
    const K_enc  = crypto.getRandomValues(new Uint8Array(32));
    const K_auth = crypto.getRandomValues(new Uint8Array(32));
    const salt   = crypto.getRandomValues(new Uint8Array(16));
    await saveKeys(db, { syncId: 'sync-id-A', K_enc, K_auth, salt });
    expect(await hasKeys(db)).toBe(true);
    const loaded = await loadKeys(db);
    expect(loaded?.syncId).toBe('sync-id-A');
    expect(loaded?.K_enc).toEqual(K_enc);
    expect(loaded?.K_auth).toEqual(K_auth);
    expect(loaded?.salt).toEqual(salt);
    db.close();
  });

  it('saveKeys overwrites previously saved keys (singleton)', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-A',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });
    const newKenc = crypto.getRandomValues(new Uint8Array(32));
    await saveKeys(db, {
      syncId: 'sync-id-B',
      K_enc:  newKenc,
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });
    const loaded = await loadKeys(db);
    expect(loaded?.syncId).toBe('sync-id-B');
    expect(loaded?.K_enc).toEqual(newKenc);
    db.close();
  });

  it('wipeKeys removes the singleton', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'x',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });
    await wipeKeys(db);
    expect(await hasKeys(db)).toBe(false);
    expect(await loadKeys(db)).toBeNull();
    db.close();
  });
});
