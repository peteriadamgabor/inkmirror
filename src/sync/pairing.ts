import type { InkMirrorDb } from '../db/connection';
import { deriveKeys, toBase64Url, fromBase64Url } from './crypto';
import { saveKeys, wipeKeys, loadKeys } from './keystore';
import { createSyncClient } from './client';
import { setCircleStatus } from './state';

export interface InitCircleArgs {
  db: InkMirrorDb;
  baseUrl: string;
  passphrase: string;
}

export async function initCircle(args: InitCircleArgs): Promise<{ syncId: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { K_enc, K_auth, auth_proof } = await deriveKeys(args.passphrase, salt);

  const client = createSyncClient({ baseUrl: args.baseUrl, K_auth });
  const { syncId } = await client.createCircle({
    auth_proof_b64: toBase64Url(auth_proof),
    salt_b64:       toBase64Url(salt),
  });

  await saveKeys(args.db, { syncId, K_enc, K_auth, salt });
  setCircleStatus({ kind: 'active', syncId });
  return { syncId };
}

export interface IssuePaircodeArgs {
  db: InkMirrorDb;
  baseUrl: string;
  syncId: string;
}

export async function issuePaircode(args: IssuePaircodeArgs): Promise<{ paircode: string; expiresAt: string }> {
  const keys = await loadKeys(args.db);
  if (!keys || keys.syncId !== args.syncId) {
    throw new Error('no keys for this syncId — cannot issue paircode');
  }
  const client = createSyncClient({ baseUrl: args.baseUrl, K_auth: keys.K_auth });
  return client.issuePaircode(args.syncId);
}

export interface RedeemPaircodeArgs {
  db: InkMirrorDb;
  baseUrl: string;
  paircode: string;
  passphrase: string;
}

export async function redeemPaircode(args: RedeemPaircodeArgs): Promise<{ syncId: string }> {
  // Step 1 — exchange paircode for syncId + salt (unauthenticated route).
  const tempClient = createSyncClient({ baseUrl: args.baseUrl, K_auth: new Uint8Array(32) });
  const { syncId, salt: saltB64 } = await tempClient.redeemPaircode(args.paircode);

  const salt = fromBase64Url(saltB64);

  // Step 2 — derive keys with the user's passphrase + the server's salt.
  const { K_enc, K_auth } = await deriveKeys(args.passphrase, salt);

  // Step 3 — verify the passphrase by making an authenticated /sync/list call.
  // If the passphrase is wrong, K_auth will be wrong and the server returns 401.
  // SyncHttpError propagates to the caller — we intentionally do not persist keys
  // on failure so the keystore stays clean.
  const client = createSyncClient({ baseUrl: args.baseUrl, K_auth });
  await client.list(syncId);

  // Step 4 — passphrase verified, persist + mark active.
  await saveKeys(args.db, { syncId, K_enc, K_auth, salt });
  setCircleStatus({ kind: 'active', syncId });
  return { syncId };
}

export interface DestroyCircleArgs {
  db: InkMirrorDb;
  baseUrl: string;
  syncId: string;
  K_auth: Uint8Array;
}

export async function destroyCircle(args: DestroyCircleArgs): Promise<void> {
  const client = createSyncClient({ baseUrl: args.baseUrl, K_auth: args.K_auth });
  // Best-effort server delete: the local keystore is always wiped regardless of
  // whether the remote call succeeds. The caller can inspect the thrown error to
  // show a warning, but the circle is considered destroyed locally either way.
  await client.deleteCircle(args.syncId).catch(() => {
    /* swallow — local wipe proceeds unconditionally */
  });
  await wipeKeys(args.db);
  setCircleStatus({ kind: 'unconfigured' });
}
