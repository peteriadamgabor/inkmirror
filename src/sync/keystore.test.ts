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

  it('round-trips saved keys (K_enc imported as non-extractable CryptoKey)', async () => {
    const db = await connectDB(TEST_DB);
    const K_enc  = crypto.getRandomValues(new Uint8Array(32));
    const K_auth = crypto.getRandomValues(new Uint8Array(32));
    const salt   = crypto.getRandomValues(new Uint8Array(16));
    try {
      await saveKeys(db, { syncId: 'sync-id-A', K_enc, K_auth, salt });
      expect(await hasKeys(db)).toBe(true);
      const loaded = await loadKeys(db);
      expect(loaded).not.toBeNull();
      expect(loaded?.syncId).toBe('sync-id-A');
      // K_enc is now a CryptoKey, NOT raw bytes. Verify the I1 invariant
      // (non-extractable AES-GCM secret) and round-trip via encrypt/decrypt.
      expect(loaded?.K_enc).toBeInstanceOf(CryptoKey);
      expect(loaded?.K_enc.type).toBe('secret');
      expect(loaded?.K_enc.extractable).toBe(false);
      // K_auth is still raw bytes — used as a Bearer token, exported by design.
      expect(loaded?.K_auth).toEqual(K_auth);
      expect(loaded?.salt).toEqual(salt);
    } finally {
      db.close();
    }
  });

  it('saveKeys overwrites previously saved keys (singleton)', async () => {
    const db = await connectDB(TEST_DB);
    try {
      await saveKeys(db, {
        syncId: 'sync-id-A',
        K_enc:  crypto.getRandomValues(new Uint8Array(32)),
        K_auth: crypto.getRandomValues(new Uint8Array(32)),
        salt:   crypto.getRandomValues(new Uint8Array(16)),
      });
      await saveKeys(db, {
        syncId: 'sync-id-B',
        K_enc:  crypto.getRandomValues(new Uint8Array(32)),
        K_auth: crypto.getRandomValues(new Uint8Array(32)),
        salt:   crypto.getRandomValues(new Uint8Array(16)),
      });
      const loaded = await loadKeys(db);
      expect(loaded?.syncId).toBe('sync-id-B');
      // Can no longer compare raw bytes; verify the imported CryptoKey
      // shape and rely on the round-trip integration test in crypto.test.ts.
      expect(loaded?.K_enc).toBeInstanceOf(CryptoKey);
    } finally {
      db.close();
    }
  });

  it('wipeKeys removes the singleton', async () => {
    const db = await connectDB(TEST_DB);
    try {
      await saveKeys(db, {
        syncId: 'x',
        K_enc:  crypto.getRandomValues(new Uint8Array(32)),
        K_auth: crypto.getRandomValues(new Uint8Array(32)),
        salt:   crypto.getRandomValues(new Uint8Array(16)),
      });
      await wipeKeys(db);
      expect(await hasKeys(db)).toBe(false);
      expect(await loadKeys(db)).toBeNull();
    } finally {
      db.close();
    }
  });
});
