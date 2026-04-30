// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB } from '../db/connection';
import { initCircle, issuePaircode, redeemPaircode, destroyCircle } from './pairing';
import { hasKeys } from './keystore';
import { circleStatus, setCircleStatus } from './state';
import { SyncHttpError } from './client';
import { toBase64Url } from './crypto';
import { loadMarker, stopPendingDeletionRetry } from './pending-deletion';

const TEST_DB = 'inkmirror-pairing-test';

// Node test environment has no localStorage; pending-deletion.ts wraps
// reads/writes in try/catch so production code degrades gracefully, but
// the tests want to assert the marker actually persisted. Provide a
// minimal in-memory shim so loadMarker / saveMarker work.
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
  } else {
    try { globalThis.localStorage.removeItem('inkmirror.sync.pendingDeletion'); } catch { /* ignore */ }
  }
}

beforeEach(async () => {
  installLocalStorageShim();
  stopPendingDeletionRetry();
  try { localStorage.removeItem('inkmirror.sync.pendingDeletion'); } catch { /* ignore */ }
  await deleteDB(TEST_DB);
  setCircleStatus({ kind: 'unconfigured' });
});

describe('initCircle', () => {
  it('derives keys, calls /sync/circles, persists, sets circle active', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ syncId: 'sync-id-NEW' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const result = await initCircle({ db, baseUrl: 'http://x', passphrase: 'river-canyon-violet-anchor' });

    expect(result.syncId).toBe('sync-id-NEW');
    expect(await hasKeys(db)).toBe(true);
    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-NEW' });
    db.close();

    // Verify the request body had auth_proof + salt
    const reqInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(reqInit.body as string) as { auth_proof: string; salt: string };
    expect(body.auth_proof).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.salt).toMatch(/^[A-Za-z0-9_-]+$/);
  }, 30_000);
});

describe('issuePaircode', () => {
  it('forwards to /sync/circles/:id/paircode and returns the response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ paircode: 'ABCDEF', expiresAt: '2026-04-27T12:02:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Populate the keystore first so issuePaircode can load K_auth internally.
    const db = await connectDB(TEST_DB);
    const { saveKeys } = await import('./keystore');
    await saveKeys(db, {
      syncId: 'sync-id-1',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: new Uint8Array(32),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });

    const r = await issuePaircode({ db, baseUrl: 'http://x', syncId: 'sync-id-1' });
    expect(r).toEqual({ paircode: 'ABCDEF', expiresAt: '2026-04-27T12:02:00Z' });
    db.close();
  });
});

describe('redeemPaircode', () => {
  it('redeems, derives keys, verifies passphrase via /sync/list, persists, marks active', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const fetchMock = vi.fn()
      // First call: redeem returns syncId + salt
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ syncId: 'sync-id-EXISTING', salt: toBase64Url(salt) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ))
      // Second call: /sync/list returns 200 (passphrase verified)
      .mockResolvedValueOnce(new Response('[]', {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const result = await redeemPaircode({ db, baseUrl: 'http://x', paircode: 'ABCDEF', passphrase: 'river-canyon-violet-anchor' });

    expect(result.syncId).toBe('sync-id-EXISTING');
    expect(await hasKeys(db)).toBe(true);
    expect(circleStatus().kind).toBe('active');
    db.close();
  }, 30_000);

  it('throws SyncHttpError on wrong passphrase (server returns 401)', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ syncId: 'sync-id-EXISTING', salt: toBase64Url(salt) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'auth_mismatch' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    await expect(redeemPaircode({ db, baseUrl: 'http://x', paircode: 'ABCDEF', passphrase: 'wrong-passphrase-here' }))
      .rejects.toBeInstanceOf(SyncHttpError);

    // After failure, no keys should have been saved
    expect(await hasKeys(db)).toBe(false);
    db.close();
  }, 30_000);
});

describe('destroyCircle', () => {
  it('204 → completed: wipes keys, marks unconfigured', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const { saveKeys } = await import('./keystore');
    await saveKeys(db, {
      syncId: 'sync-id-X',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });
    setCircleStatus({ kind: 'active', syncId: 'sync-id-X' });

    const result = await destroyCircle({ db, baseUrl: 'http://x', syncId: 'sync-id-X', K_auth: new Uint8Array(32) });

    expect(result.kind).toBe('completed');
    expect(await hasKeys(db)).toBe(false);
    expect(circleStatus().kind).toBe('unconfigured');
    db.close();
  });

  it('404 → completed: server says no such circle, still wipes keys (idempotent retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const { saveKeys } = await import('./keystore');
    await saveKeys(db, {
      syncId: 'sync-id-X',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });

    const result = await destroyCircle({ db, baseUrl: 'http://x', syncId: 'sync-id-X', K_auth: new Uint8Array(32) });

    expect(result.kind).toBe('completed');
    expect(await hasKeys(db)).toBe(false);
    expect(circleStatus().kind).toBe('unconfigured');
    db.close();
  });

  it('network failure → pending: keys SURVIVE, status flips to pending_deletion, marker persisted', async () => {
    // The whole point of U1: don't wipe keys before the server confirms.
    // Otherwise the user has lost the ability to ever authenticate the
    // deletion if they were offline at click time.
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('NetworkError'));
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const { saveKeys } = await import('./keystore');
    await saveKeys(db, {
      syncId: 'sync-id-OFFLINE',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });
    setCircleStatus({ kind: 'active', syncId: 'sync-id-OFFLINE' });

    // Note: no `reopenDb` — we test destroyCircle's contract here, not
    // the background scheduler. The scheduler has its own tests that
    // can manage its lifecycle without racing fake-indexeddb's deleteDB.
    const result = await destroyCircle({
      db,
      baseUrl: 'http://x',
      syncId: 'sync-id-OFFLINE',
      K_auth: new Uint8Array(32),
    });

    expect(result.kind).toBe('pending');
    // Keys MUST still be present so the retry can authenticate later.
    expect(await hasKeys(db)).toBe(true);
    // Status reflects the in-progress deletion.
    const status = circleStatus();
    expect(status.kind).toBe('pending_deletion');
    if (status.kind === 'pending_deletion') {
      expect(status.syncId).toBe('sync-id-OFFLINE');
    }
    // Marker persisted so the deletion survives a reload.
    const marker = loadMarker();
    expect(marker?.syncId).toBe('sync-id-OFFLINE');
    db.close();
  });

  it('5xx → pending: same protective behavior as a network failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'oops' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const db = await connectDB(TEST_DB);
    const { saveKeys } = await import('./keystore');
    await saveKeys(db, {
      syncId: 'sync-id-503',
      K_enc:  crypto.getRandomValues(new Uint8Array(32)),
      K_auth: crypto.getRandomValues(new Uint8Array(32)),
      salt:   crypto.getRandomValues(new Uint8Array(16)),
    });

    const result = await destroyCircle({
      db,
      baseUrl: 'http://x',
      syncId: 'sync-id-503',
      K_auth: new Uint8Array(32),
    });

    expect(result.kind).toBe('pending');
    expect(await hasKeys(db)).toBe(true);
    expect(circleStatus().kind).toBe('pending_deletion');
    db.close();
  });
});
