// src/sync/pending-deletion.test.ts
// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB } from '../db/connection';
import { saveKeys, hasKeys } from './keystore';
import { circleStatus, setCircleStatus } from './state';
import {
  loadMarker,
  saveMarker,
  clearMarker,
  attemptDeletion,
  startPendingDeletionRetry,
  stopPendingDeletionRetry,
  forceClearLocally,
} from './pending-deletion';

const TEST_DB = 'inkmirror';
const MARKER_KEY = 'inkmirror.sync.pendingDeletion';

// Node test env has no localStorage; pending-deletion.ts wraps reads/
// writes in try/catch so production code degrades gracefully, but the
// tests need real persistence to verify the marker round-trips.
function installLocalStorageShim() {
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

function makeKeys(syncId: string) {
  return {
    syncId,
    K_enc: crypto.getRandomValues(new Uint8Array(32)),
    K_auth: crypto.getRandomValues(new Uint8Array(32)),
    salt: crypto.getRandomValues(new Uint8Array(16)),
  };
}

async function seedKeys(syncId: string): Promise<void> {
  const db = await connectDB(TEST_DB);
  await saveKeys(db, makeKeys(syncId));
  db.close();
}

const K_AUTH = new Uint8Array(32).fill(7);

beforeEach(async () => {
  installLocalStorageShim();
  stopPendingDeletionRetry();
  clearMarker();
  await deleteDB(TEST_DB);
  setCircleStatus({ kind: 'unconfigured' });
});

afterEach(() => {
  stopPendingDeletionRetry();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('marker persistence', () => {
  it('round-trips save → load', () => {
    saveMarker({ syncId: 'sync-A', since: '2026-06-11T08:00:00.000Z' });
    expect(loadMarker()).toEqual({ syncId: 'sync-A', since: '2026-06-11T08:00:00.000Z' });
  });

  it('returns null when nothing is stored', () => {
    expect(loadMarker()).toBeNull();
  });

  it('clearMarker removes the entry', () => {
    saveMarker({ syncId: 'sync-A', since: '2026-06-11T08:00:00.000Z' });
    clearMarker();
    expect(loadMarker()).toBeNull();
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    localStorage.setItem(MARKER_KEY, '{not json!!');
    expect(loadMarker()).toBeNull();
  });

  it('returns null for valid JSON with the wrong shape', () => {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ syncId: 42 }));
    expect(loadMarker()).toBeNull();
    localStorage.setItem(MARKER_KEY, JSON.stringify({ since: '2026-06-11' }));
    expect(loadMarker()).toBeNull();
    localStorage.setItem(MARKER_KEY, JSON.stringify(null));
    expect(loadMarker()).toBeNull();
  });

  it('degrades gracefully when localStorage throws (privacy mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveMarker({ syncId: 'x', since: 'y' })).not.toThrow();
    expect(loadMarker()).toBeNull();
    expect(() => clearMarker()).not.toThrow();
  });
});

describe('attemptDeletion', () => {
  it('returns completed on 204 and issues an authenticated DELETE to the circle URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await attemptDeletion({ baseUrl: '', syncId: 'sync-A', K_auth: K_AUTH });

    expect(result).toEqual({ kind: 'completed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/sync/circles/sync-A');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('authorization')).toMatch(/^Bearer .+/);
  });

  it('treats 404 as completed — nothing left to delete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const result = await attemptDeletion({ baseUrl: '', syncId: 'sync-A', K_auth: K_AUTH });
    expect(result).toEqual({ kind: 'completed' });
  });

  it('stays pending on a 5xx with the status in the reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const result = await attemptDeletion({ baseUrl: '', syncId: 'sync-A', K_auth: K_AUTH });
    expect(result).toEqual({ kind: 'pending', reason: 'http 503' });
  });

  it('stays pending on auth drift (401) — keys must not be wiped on this path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    const result = await attemptDeletion({ baseUrl: '', syncId: 'sync-A', K_auth: K_AUTH });
    expect(result).toEqual({ kind: 'pending', reason: 'http 401' });
  });

  it('stays pending on a network error with the message as reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const result = await attemptDeletion({ baseUrl: '', syncId: 'sync-A', K_auth: K_AUTH });
    expect(result).toEqual({ kind: 'pending', reason: 'offline' });
  });
});

describe('startPendingDeletionRetry', () => {
  it('completes immediately when the server confirms: wipes keys + marker, status → unconfigured', async () => {
    await seedKeys('sync-OK');
    saveMarker({ syncId: 'sync-OK', since: '2026-06-11T08:00:00.000Z' });
    setCircleStatus({ kind: 'pending_deletion', syncId: 'sync-OK', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    await vi.waitFor(async () => {
      expect(loadMarker()).toBeNull();
      expect(circleStatus()).toEqual({ kind: 'unconfigured' });
      const db = await connectDB(TEST_DB);
      const keys = await hasKeys(db);
      db.close();
      expect(keys).toBe(false);
    });
  });

  it('uses the keystore syncId for the DELETE, not the marker (stale-marker edge)', async () => {
    await seedKeys('sync-REAL');
    saveMarker({ syncId: 'sync-STALE', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/sync/circles/sync-REAL');
  });

  it('stays pending on failure: marker and keys survive for the next retry', async () => {
    await seedKeys('sync-PEND');
    saveMarker({ syncId: 'sync-PEND', since: '2026-06-11T08:00:00.000Z' });
    setCircleStatus({ kind: 'pending_deletion', syncId: 'sync-PEND', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(loadMarker()?.syncId).toBe('sync-PEND');
    const db = await connectDB(TEST_DB);
    expect(await hasKeys(db)).toBe(true);
    db.close();
    expect(circleStatus().kind).toBe('pending_deletion');
  });

  it('is idempotent — a second start does not spawn a second immediate attempt', async () => {
    await seedKeys('sync-IDEM');
    saveMarker({ syncId: 'sync-IDEM', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });
    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Give any (incorrect) second loop a chance to fire its kick-off.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tears down when keys vanished underneath (other tab cleared them): marker wiped, no fetch', async () => {
    // No keys seeded.
    saveMarker({ syncId: 'sync-GONE', since: '2026-06-11T08:00:00.000Z' });
    setCircleStatus({ kind: 'pending_deletion', syncId: 'sync-GONE', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    await vi.waitFor(() => {
      expect(loadMarker()).toBeNull();
      expect(circleStatus()).toEqual({ kind: 'unconfigured' });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries on the 60s interval and completes once the server recovers', async () => {
    // Fake ONLY the interval — fake-indexeddb and vi.waitFor need real
    // setTimeout/setImmediate to make progress.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await seedKeys('sync-RETRY');
    saveMarker({ syncId: 'sync-RETRY', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });

    // First (immediate) attempt fails.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(loadMarker()).not.toBeNull();

    // Advance the retry interval — second attempt succeeds.
    vi.advanceTimersByTime(60_000);
    await vi.waitFor(async () => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(loadMarker()).toBeNull();
      expect(circleStatus()).toEqual({ kind: 'unconfigured' });
      const db = await connectDB(TEST_DB);
      const keys = await hasKeys(db);
      db.close();
      expect(keys).toBe(false);
    });
  });

  it('after a completed run the scheduler is torn down, so a fresh start works again', async () => {
    await seedKeys('sync-AGAIN');
    saveMarker({ syncId: 'sync-AGAIN', since: '2026-06-11T08:00:00.000Z' });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });
    await vi.waitFor(() => expect(loadMarker()).toBeNull());

    // A new pending deletion later on must be able to start a new loop.
    await seedKeys('sync-AGAIN-2');
    saveMarker({ syncId: 'sync-AGAIN-2', since: '2026-06-11T09:00:00.000Z' });
    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });
    await vi.waitFor(() => expect(loadMarker()).toBeNull());
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('forceClearLocally', () => {
  it('wipes keys + marker, stops the retry loop, status → unconfigured — without server confirmation', async () => {
    await seedKeys('sync-FORCE');
    saveMarker({ syncId: 'sync-FORCE', since: '2026-06-11T08:00:00.000Z' });
    setCircleStatus({ kind: 'pending_deletion', syncId: 'sync-FORCE', since: '2026-06-11T08:00:00.000Z' });
    // Server permanently unreachable.
    const fetchMock = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    startPendingDeletionRetry({ baseUrl: '', reopenDb: () => connectDB(TEST_DB) });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const db = await connectDB(TEST_DB);
    await forceClearLocally(db);
    db.close();

    expect(loadMarker()).toBeNull();
    expect(circleStatus()).toEqual({ kind: 'unconfigured' });
    const verify = await connectDB(TEST_DB);
    expect(await hasKeys(verify)).toBe(false);
    verify.close();
    // No fetch was needed for the clear itself; the loop is stopped, so
    // give it a beat and assert the count does not keep climbing.
    const callsAfterClear = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock.mock.calls.length).toBe(callsAfterClear);
  });
});
