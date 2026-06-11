import type { InkMirrorDb, SyncKeysRow, SyncKeysRowV1, SyncKeysRowV2 } from '../db/connection';
import { toBase64Url, fromBase64Url, importEncKey } from './crypto';

/**
 * In-memory shape returned by `loadKeys`. K_enc is a non-extractable
 * `CryptoKey` (see I1 in the security audit) — JS cannot read its raw
 * bytes back out, only call encrypt/decrypt with it. K_auth stays as
 * raw bytes because it is used as a Bearer token (base64url-encoded
 * into the Authorization header) and so is functionally exported.
 */
export interface KeysRecord {
  syncId: string;
  K_enc: CryptoKey;
  K_auth: Uint8Array;
  salt: Uint8Array;
}

/**
 * Input shape for `saveKeys`. The caller has just derived the bytes
 * (or accepted them via paircode redeem) and wants to persist + use.
 * `saveKeys` imports K_enc to a non-extractable CryptoKey *before*
 * persisting — raw K_enc bytes never touch IndexedDB (closes L4).
 * The caller can immediately call `loadKeys` to get the imported
 * CryptoKey form, OR import inline via `importEncKey` if the bytes
 * are already in scope. `saveKeys` does NOT zero `k.K_enc` — the
 * caller owns those bytes and may still need them.
 */
export interface KeysInput {
  syncId: string;
  K_enc: Uint8Array;
  K_auth: Uint8Array;
  salt: Uint8Array;
}

const STORE = 'sync_keys' as const;
const KEY = 'singleton' as const;

/** Legacy rows predate the `v` discriminant — its absence marks them. */
function isLegacyRow(row: SyncKeysRow): row is SyncKeysRowV1 {
  return !('v' in row);
}

export async function hasKeys(db: InkMirrorDb): Promise<boolean> {
  const row = await db.get(STORE, KEY);
  return row !== undefined;
}

export async function saveKeys(db: InkMirrorDb, k: KeysInput): Promise<void> {
  const row: SyncKeysRowV2 = {
    id: KEY,
    v: 2,
    syncId: k.syncId,
    salt: toBase64Url(k.salt),
    K_enc_key: await importEncKey(k.K_enc),
    K_auth_b64: toBase64Url(k.K_auth),
    createdAt: new Date().toISOString(),
  };
  await db.put(STORE, row);
}

export async function loadKeys(db: InkMirrorDb): Promise<KeysRecord | null> {
  const row = await db.get(STORE, KEY);
  if (!row) return null;

  if (isLegacyRow(row)) {
    // Lazy migration: the legacy row holds K_enc as plaintext base64.
    // Import it to a non-extractable CryptoKey, rewrite the row in the
    // v2 shape, and continue — the base64 copy is gone from IDB after
    // this load. No data loss, no re-pairing; data encrypted under the
    // same key keeps decrypting because the key bytes are identical.
    const K_enc_bytes = fromBase64Url(row.K_enc_b64);
    const K_enc = await importEncKey(K_enc_bytes);
    // Best-effort: zero the raw bytes so a heap dump catches a smaller
    // window. The CryptoKey object is the only durable handle now.
    K_enc_bytes.fill(0);
    const migrated: SyncKeysRowV2 = {
      id: KEY,
      v: 2,
      syncId: row.syncId,
      salt: row.salt,
      K_enc_key: K_enc,
      K_auth_b64: row.K_auth_b64,
      createdAt: row.createdAt,
    };
    await db.put(STORE, migrated);
    return {
      syncId: row.syncId,
      K_enc,
      K_auth: fromBase64Url(row.K_auth_b64),
      salt: fromBase64Url(row.salt),
    };
  }

  // v2 row: the CryptoKey comes back from IDB directly — structured
  // clone preserves type/extractable/usages. No re-import needed.
  return {
    syncId: row.syncId,
    K_enc: row.K_enc_key,
    K_auth: fromBase64Url(row.K_auth_b64),
    salt: fromBase64Url(row.salt),
  };
}

export async function wipeKeys(db: InkMirrorDb): Promise<void> {
  await db.delete(STORE, KEY);
}
