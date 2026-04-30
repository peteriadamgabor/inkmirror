import type { InkMirrorDb, SyncKeysRow } from '../db/connection';
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
 * `saveKeys` writes the bytes to IDB; the caller can immediately call
 * `loadKeys` to get the imported CryptoKey form, OR import inline via
 * `importEncKey` if the bytes are already in scope.
 */
export interface KeysInput {
  syncId: string;
  K_enc: Uint8Array;
  K_auth: Uint8Array;
  salt: Uint8Array;
}

const STORE = 'sync_keys' as const;
const KEY = 'singleton' as const;

export async function hasKeys(db: InkMirrorDb): Promise<boolean> {
  const row = await db.get(STORE, KEY);
  return row !== undefined;
}

export async function saveKeys(db: InkMirrorDb, k: KeysInput): Promise<void> {
  const row: SyncKeysRow = {
    id: KEY,
    syncId: k.syncId,
    salt: toBase64Url(k.salt),
    K_enc_b64: toBase64Url(k.K_enc),
    K_auth_b64: toBase64Url(k.K_auth),
    createdAt: new Date().toISOString(),
  };
  await db.put(STORE, row);
}

export async function loadKeys(db: InkMirrorDb): Promise<KeysRecord | null> {
  const row = await db.get(STORE, KEY);
  if (!row) return null;
  const K_enc_bytes = fromBase64Url(row.K_enc_b64);
  const K_enc = await importEncKey(K_enc_bytes);
  // Best-effort: zero the raw bytes so a heap dump catches a smaller
  // window. The CryptoKey object is the only durable handle now.
  K_enc_bytes.fill(0);
  return {
    syncId: row.syncId,
    K_enc,
    K_auth: fromBase64Url(row.K_auth_b64),
    salt: fromBase64Url(row.salt),
  };
}

export async function wipeKeys(db: InkMirrorDb): Promise<void> {
  await db.delete(STORE, KEY);
}
