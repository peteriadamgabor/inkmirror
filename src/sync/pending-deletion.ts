/**
 * Resilient sync-circle deletion.
 *
 * The privacy page promises that disabling sync deletes the user's
 * server-side blobs. A naive implementation would fire DELETE and wipe
 * local keys regardless — which silently breaks the promise when the
 * user is offline at click time, hits a 5xx, or has token drift. Once
 * the local keys are gone, the user has lost the ability to ever
 * authenticate the deletion.
 *
 * Instead we treat deletion as a two-phase operation:
 *
 *   1. Mark intent — write a `{ syncId, since }` marker to localStorage.
 *      Local keys stay put; the user appears "disabled" to the UI but
 *      the keystore is intact for the retry.
 *   2. Confirm — once DELETE returns 200 / 204 / 404, wipe the marker
 *      and the local keys, and only then transition the UI to
 *      `unconfigured`.
 *
 * The marker survives reloads, so a user who closes the tab while
 * offline still has their deletion completed when they next come back
 * online and open the app.
 */

import type { InkMirrorDb } from '../db/connection';
import { wipeKeys, loadKeys } from './keystore';
import { createSyncClient, SyncHttpError } from './client';
import { setCircleStatus } from './state';

const MARKER_KEY = 'inkmirror.sync.pendingDeletion';
const RETRY_INTERVAL_MS = 60_000;

export interface PendingDeletionMarker {
  syncId: string;
  /** ISO timestamp of when the user first clicked Disable. */
  since: string;
}

/** Outcome of a single deletion attempt. */
export type DeletionAttemptResult =
  | { kind: 'completed' }
  | { kind: 'pending'; reason: string };

export function loadMarker(): PendingDeletionMarker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingDeletionMarker>;
    if (typeof parsed.syncId !== 'string' || typeof parsed.since !== 'string') {
      return null;
    }
    return { syncId: parsed.syncId, since: parsed.since };
  } catch {
    return null;
  }
}

export function saveMarker(marker: PendingDeletionMarker): void {
  try {
    localStorage.setItem(MARKER_KEY, JSON.stringify(marker));
  } catch {
    // localStorage can throw under privacy modes; the in-memory
    // status still reflects the pending state for the current tab.
  }
}

export function clearMarker(): void {
  try {
    localStorage.removeItem(MARKER_KEY);
  } catch {
    // ignore — best effort
  }
}

/**
 * Try the server DELETE once. Returns 'completed' on a confirmed
 * success (2xx or 404), 'pending' on any other outcome.
 */
export async function attemptDeletion(args: {
  baseUrl: string;
  syncId: string;
  K_auth: Uint8Array;
}): Promise<DeletionAttemptResult> {
  const client = createSyncClient({ baseUrl: args.baseUrl, K_auth: args.K_auth });
  try {
    await client.deleteCircle(args.syncId);
    return { kind: 'completed' };
  } catch (err) {
    if (err instanceof SyncHttpError && err.status === 404) {
      // 404 = "no such circle" — either we already deleted it on a
      // previous attempt or the operator wiped it server-side. Either
      // way nothing left to delete.
      return { kind: 'completed' };
    }
    const reason =
      err instanceof SyncHttpError
        ? `http ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { kind: 'pending', reason };
  }
}

let scheduler: { stop: () => void } | null = null;

/**
 * Start retrying a pending deletion in the background. Idempotent —
 * calling twice does NOT spawn a second loop. The loop:
 *
 *   - retries immediately when the browser fires `online`,
 *   - retries every 60s while online,
 *   - tears itself down after a successful 2xx/404 (keys + marker
 *     wiped, status → unconfigured).
 */
export function startPendingDeletionRetry(args: {
  baseUrl: string;
  /** Opens an InkMirrorDb on demand. Each retry attempt opens its own
   *  handle and closes it after — we never hold a connection across the
   *  fetch, both to keep things tidy and so test teardown's deleteDB
   *  isn't blocked. */
  reopenDb: () => Promise<InkMirrorDb>;
}): void {
  if (scheduler) return;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tryOnce = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const db = await args.reopenDb();
      const keys = await loadKeys(db);
      db.close();
      if (!keys) {
        // Keys vanished underneath us (other tab cleared them, or a
        // force-clear happened). Marker is meaningless now — wipe and
        // tear down.
        clearMarker();
        setCircleStatus({ kind: 'unconfigured' });
        teardown();
        return;
      }
      const result = await attemptDeletion({
        baseUrl: args.baseUrl,
        syncId: keys.syncId,
        K_auth: keys.K_auth,
      });
      if (result.kind === 'completed') {
        const wipeDb = await args.reopenDb();
        try {
          await wipeKeys(wipeDb);
        } finally {
          wipeDb.close();
        }
        clearMarker();
        setCircleStatus({ kind: 'unconfigured' });
        teardown();
      }
      // pending → leave the loop running for the next interval / online tick.
    } catch {
      // Any unexpected error: stay pending, try again later.
    } finally {
      running = false;
    }
  };

  const onOnline = (): void => {
    void tryOnce();
  };

  const teardown = (): void => {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
    scheduler = null;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }
  intervalId = setInterval(() => void tryOnce(), RETRY_INTERVAL_MS);

  scheduler = { stop: teardown };

  // Kick one immediate attempt — covers the case where the user clicks
  // Disable while online but the request raced a transient hiccup.
  void tryOnce();
}

export function stopPendingDeletionRetry(): void {
  scheduler?.stop();
}

/**
 * Force-clear local sync state without confirming the server side.
 * Escape hatch for the user who is permanently stuck pending — e.g.
 * passphrase forgotten, server unreachable, or they simply want the
 * local UI off and accept that server data may linger. Privacy page
 * should call out that this option exists.
 */
export async function forceClearLocally(db: InkMirrorDb): Promise<void> {
  await wipeKeys(db);
  clearMarker();
  stopPendingDeletionRetry();
  setCircleStatus({ kind: 'unconfigured' });
}
