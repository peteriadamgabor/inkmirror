import type { InkMirrorDb } from '../db/connection';
import { deriveKeys, toBase64Url, fromBase64Url } from './crypto';
import { saveKeys, wipeKeys, loadKeys } from './keystore';
import { createSyncClient } from './client';
import { setCircleStatus } from './state';
import {
  attemptDeletion,
  clearMarker,
  saveMarker,
  startPendingDeletionRetry,
} from './pending-deletion';

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
  /** Used by the retry scheduler to reopen IDB on each attempt — the
   *  initial `db` handle may be closed by the time a retry fires. */
  reopenDb?: () => Promise<InkMirrorDb>;
}

export type DestroyCircleResult = { kind: 'completed' } | { kind: 'pending'; reason: string };

/**
 * Disable sync. Two-phase: try server DELETE first; only wipe local
 * keys when the server confirms 2xx or 404. On any other outcome
 * (offline, 5xx, auth drift) we record a `pending_deletion` marker so
 * the deletion can be retried in the background — including across
 * reloads — and only finalise the local wipe once the server agrees.
 *
 * This closes a privacy-promise gap: previously, an offline disable
 * would silently leave server-side blobs behind while the user
 * believed they had deleted them.
 */
export async function destroyCircle(args: DestroyCircleArgs): Promise<DestroyCircleResult> {
  const result = await attemptDeletion({
    baseUrl: args.baseUrl,
    syncId: args.syncId,
    K_auth: args.K_auth,
  });

  if (result.kind === 'completed') {
    await wipeKeys(args.db);
    clearMarker();
    setCircleStatus({ kind: 'unconfigured' });
    return { kind: 'completed' };
  }

  // Server didn't confirm. Keep keys, record intent, surface to the UI,
  // and start the background retry loop so the deletion completes when
  // the network/server cooperates.
  const since = new Date().toISOString();
  saveMarker({ syncId: args.syncId, since });
  setCircleStatus({ kind: 'pending_deletion', syncId: args.syncId, since });
  if (args.reopenDb) {
    startPendingDeletionRetry({
      baseUrl: args.baseUrl,
      reopenDb: args.reopenDb,
    });
  }
  return result;
}

