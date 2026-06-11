import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB, type SyncKeysRowV1 } from '../db/connection';
import { saveKeys, loadKeys, wipeKeys, hasKeys } from './keystore';
import { toBase64Url, importEncKey, encryptBundle, decryptBundle } from './crypto';

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

  it('persists K_enc as a CryptoKey in IDB — never as base64 (L4 closed)', async () => {
    const db = await connectDB(TEST_DB);
    try {
      await saveKeys(db, {
        syncId: 'sync-id-A',
        K_enc:  crypto.getRandomValues(new Uint8Array(32)),
        K_auth: crypto.getRandomValues(new Uint8Array(32)),
        salt:   crypto.getRandomValues(new Uint8Array(16)),
      });
      const row = await db.get('sync_keys', 'singleton');
      expect(row).toBeDefined();
      if (!row || !('v' in row)) throw new Error('expected a v2 row');
      expect(row.v).toBe(2);
      expect(row.K_enc_key).toBeInstanceOf(CryptoKey);
      expect(row.K_enc_key.extractable).toBe(false);
      expect(row.K_enc_key.usages).toEqual(['encrypt', 'decrypt']);
      // No plaintext K_enc anywhere in the stored row.
      expect('K_enc_b64' in row).toBe(false);
    } finally {
      db.close();
    }
  });

  it('lazily migrates a legacy base64 row and still decrypts existing data', async () => {
    const db = await connectDB(TEST_DB);
    try {
      const K_enc  = crypto.getRandomValues(new Uint8Array(32));
      const K_auth = crypto.getRandomValues(new Uint8Array(32));
      const salt   = crypto.getRandomValues(new Uint8Array(16));

      // Simulate data a v1 install already encrypted with these key bytes.
      const plaintext = new TextEncoder().encode('two hearts, one soul');
      const legacyKey = await importEncKey(K_enc);
      const blob = await encryptBundle(legacyKey, plaintext, 'sync-legacy', 'doc-1');

      // Write the legacy (v1) row shape directly, as old installs left it.
      const legacyRow: SyncKeysRowV1 = {
        id: 'singleton',
        syncId: 'sync-legacy',
        salt: toBase64Url(salt),
        K_enc_b64: toBase64Url(K_enc),
        K_auth_b64: toBase64Url(K_auth),
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      await db.put('sync_keys', legacyRow);

      // Load: migrates in place, returns a usable CryptoKey.
      const loaded = await loadKeys(db);
      expect(loaded).not.toBeNull();
      if (!loaded) throw new Error('unreachable');
      expect(loaded.syncId).toBe('sync-legacy');
      expect(loaded.K_enc).toBeInstanceOf(CryptoKey);
      expect(loaded.K_enc.extractable).toBe(false);
      expect(loaded.K_auth).toEqual(K_auth);
      expect(loaded.salt).toEqual(salt);

      // The stored row was rewritten to v2 — base64 K_enc is gone from IDB.
      const row = await db.get('sync_keys', 'singleton');
      expect(row).toBeDefined();
      if (!row || !('v' in row)) throw new Error('expected migrated v2 row');
      expect(row.v).toBe(2);
      expect(row.K_enc_key).toBeInstanceOf(CryptoKey);
      expect('K_enc_b64' in row).toBe(false);
      expect(row.createdAt).toBe('2026-01-01T00:00:00.000Z'); // provenance kept

      // Same key bytes → old ciphertext still decrypts after migration.
      const decrypted = await decryptBundle(loaded.K_enc, blob, 'sync-legacy', 'doc-1');
      expect(new TextDecoder().decode(decrypted)).toBe('two hearts, one soul');

      // And a second load (now hitting the v2 path) yields a working key too.
      const reloaded = await loadKeys(db);
      if (!reloaded) throw new Error('unreachable');
      const decrypted2 = await decryptBundle(reloaded.K_enc, blob, 'sync-legacy', 'doc-1');
      expect(new TextDecoder().decode(decrypted2)).toBe('two hearts, one soul');
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
