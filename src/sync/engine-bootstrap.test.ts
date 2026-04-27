// src/sync/engine-bootstrap.test.ts
// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { connectDB } from '../db/connection';
import { saveKeys } from './keystore';
import { startSync, stopSync, _resetForTesting } from './engine-bootstrap';
import { circleStatus, setCircleStatus } from './state';

const TEST_DB = 'inkmirror'; // bootstrap uses connectDB() with no name → default

beforeEach(async () => {
  _resetForTesting();
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
