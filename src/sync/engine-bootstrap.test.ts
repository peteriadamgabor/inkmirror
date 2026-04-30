// src/sync/engine-bootstrap.test.ts
// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB } from '../db/connection';
import { saveKeys, hasKeys } from './keystore';
import { startSync, stopSync, _resetForTesting } from './engine-bootstrap';
import { circleStatus, setCircleStatus } from './state';
import {
  clearMarker,
  loadMarker,
  saveMarker,
  stopPendingDeletionRetry,
} from './pending-deletion';

const TEST_DB = 'inkmirror'; // bootstrap uses connectDB() with no name → default

// Node test env has no localStorage; pending-deletion.ts wraps reads/
// writes in try/catch so production code degrades gracefully, but the
// tests need real persistence to verify the marker round-trips.
function installLocalStorageShim() {
  if (typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => { mem.clear(); },
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() { return mem.size; },
    });
  }
}

beforeEach(async () => {
  installLocalStorageShim();
  _resetForTesting();
  stopPendingDeletionRetry();
  clearMarker();
  await deleteDB(TEST_DB);
  setCircleStatus({ kind: 'unconfigured' });
});

describe('engine bootstrap', () => {
  it('startSync is a no-op when no keys are stored', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await startSync({
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    });

    expect(circleStatus().kind).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('startSync sets circle active and starts the engine when keys exist', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-A',
      K_enc: crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    db.close();

    await startSync({
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    });

    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-A' });
    stopSync(); // cleanup the heartbeat interval
  });

  it('startSync called twice is idempotent', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-A',
      K_enc: crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    db.close();

    const opts = {
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    };
    await startSync(opts);
    await startSync(opts); // should not double-start

    expect(circleStatus().kind).toBe('active');
    stopSync();
  });

  it('startSync re-arms pending deletion when a marker exists, does NOT start the engine', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-PD',
      K_enc: crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    db.close();
    saveMarker({ syncId: 'sync-id-PD', since: '2026-04-30T20:00:00.000Z' });

    // Server is unreachable: any retry attempt rejects → stays pending.
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await startSync({
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    });

    expect(circleStatus()).toEqual({
      kind: 'pending_deletion',
      syncId: 'sync-id-PD',
      since: '2026-04-30T20:00:00.000Z',
    });
    // Keys must NOT be wiped — the retry needs them to authenticate.
    const dbVerify = await connectDB(TEST_DB);
    expect(await hasKeys(dbVerify)).toBe(true);
    dbVerify.close();
    // Marker survives because the retry hasn't succeeded.
    expect(loadMarker()?.syncId).toBe('sync-id-PD');
    stopPendingDeletionRetry();
  });

  it('startSync drops a stale marker that does not match the current syncId', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-CURRENT',
      K_enc: crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    db.close();
    saveMarker({ syncId: 'sync-id-DIFFERENT', since: '2026-04-29T10:00:00.000Z' });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await startSync({
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    });

    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-CURRENT' });
    expect(loadMarker()).toBeNull();
    stopSync();
  });

  it('startSync clears a marker that has no matching keys (orphan marker)', async () => {
    saveMarker({ syncId: 'sync-id-ORPHAN', since: '2026-04-29T10:00:00.000Z' });

    await startSync({
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    });

    expect(circleStatus().kind).toBe('unconfigured');
    expect(loadMarker()).toBeNull();
  });

  it('stopSync resets the singleton so the next startSync works', async () => {
    const db = await connectDB(TEST_DB);
    await saveKeys(db, {
      syncId: 'sync-id-A',
      K_enc: crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    db.close();

    const opts = {
      baseUrl: '',
      buildBundle: async () => new Uint8Array(),
      applyBundle: async () => {},
      getDocLastRevision: () => 0,
      setDocLastRevision: () => {},
    };
    await startSync(opts);
    stopSync();
    await startSync(opts); // fresh start after stop

    expect(circleStatus().kind).toBe('active');
    stopSync();
  });
});
