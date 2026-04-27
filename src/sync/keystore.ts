import type { InkMirrorDb, SyncKeysRow } from '../db/connection';
import { toBase64Url, fromBase64Url } from './crypto';

export interface KeysRecord {
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

export async function saveKeys(db: InkMirrorDb, k: KeysRecord): Promise<void> {
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
  return {
    syncId: row.syncId,
    K_enc: fromBase64Url(row.K_enc_b64),
    K_auth: fromBase64Url(row.K_auth_b64),
    salt: fromBase64Url(row.salt),
  };
}

export async function wipeKeys(db: InkMirrorDb): Promise<void> {
  await db.delete(STORE, KEY);
}
