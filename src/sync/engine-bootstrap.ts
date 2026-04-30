// src/sync/engine-bootstrap.ts
//
// Wires the engine to the rest of the app. The bootstrap is a singleton
// because there's exactly one sync circle per browser at a time.

import { connectDB } from '../db/connection';
import { loadKeys } from './keystore';
import { createSyncClient } from './client';
import { createEngine, type Engine, type ConflictResolution } from './engine';
import { setCircleStatus } from './state';
import {
  clearMarker,
  loadMarker,
  startPendingDeletionRetry,
} from './pending-deletion';

/**
 * Compile-time kill-switch. Set to `false` to disable all sync UI and engine
 * activity in the next release without removing code (rollback path 1 from
 * the spec). Existing local data is untouched; pending uploads in IDB are
 * ignored. The whole `src/sync/` tree is otherwise tree-shaken when false.
 */
export const SYNC_FEATURE = true;

let _engine: Engine | null = null;

export interface StartSyncOptions {
  baseUrl: string;
  buildBundle: (docId: string) => Promise<Uint8Array>;
  applyBundle: (docId: string, plaintext: Uint8Array) => Promise<void>;
  getDocLastRevision: (docId: string) => number;
  setDocLastRevision: (docId: string, revision: number) => void;
}

/**
 * Start the sync engine if a circle exists in IDB. No-op if not configured
 * or if SYNC_FEATURE is false. Idempotent — safe to call on every app boot.
 */
export async function startSync(opts: StartSyncOptions): Promise<void> {
  if (!SYNC_FEATURE) return;
  if (_engine) return; // already running

  const db = await connectDB();
  const keys = await loadKeys(db);
  db.close();
  if (!keys) {
    // No keys: ensure any stale pending-deletion marker doesn't outlive
    // a force-clear in another tab. Marker without keys is meaningless.
    if (loadMarker()) clearMarker();
    return;
  }

  // Pending deletion: keys still exist but the user already asked to
  // disable. Don't start the engine — re-arm the retry loop instead so
  // the deletion eventually completes once the server is reachable.
  const marker = loadMarker();
  if (marker && marker.syncId === keys.syncId) {
    setCircleStatus({
      kind: 'pending_deletion',
      syncId: marker.syncId,
      since: marker.since,
    });
    startPendingDeletionRetry({
      baseUrl: opts.baseUrl,
      reopenDb: () => connectDB(),
    });
    return;
  }
  // If the marker references a different syncId (stale from a previous
  // pairing), drop it — keys win.
  if (marker) clearMarker();

  setCircleStatus({ kind: 'active', syncId: keys.syncId });

  const client = createSyncClient({ baseUrl: opts.baseUrl, K_auth: keys.K_auth });
  _engine = createEngine({
    syncId: keys.syncId,
    client,
    K_enc: keys.K_enc,
    buildBundle: opts.buildBundle,
    applyBundle: opts.applyBundle,
    getDocLastRevision: opts.getDocLastRevision,
    setDocLastRevision: opts.setDocLastRevision,
  });
  _engine.start();
}

export function stopSync(): void {
  _engine?.stop();
  _engine = null;
}

export async function syncNow(): Promise<void> {
  await _engine?.syncNow();
}

export function markDirty(docId: string): void {
  _engine?.markDirty(docId);
}

export async function resolveConflict(docId: string, choice: ConflictResolution): Promise<void> {
  await _engine?.resolveConflict(docId, choice);
}

/** Test-only: reset the singleton between tests. */
export function _resetForTesting(): void {
  _engine?.stop();
  _engine = null;
}
