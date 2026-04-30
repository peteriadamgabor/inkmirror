// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEngine, type EngineDeps, DEBOUNCE_MS, HEARTBEAT_MS } from './engine';
import { circleStatus, docStatusFor, setCircleStatus, setDocStatus } from './state';
import type { SyncClient } from './client';
import { SyncHttpError } from './client';
import type { EncryptedBlob } from './crypto';

// Stub that returns a structurally valid EncryptedBlob without real crypto.subtle I/O.
// This keeps fake-timer promise chains drainable via vi.advanceTimersByTimeAsync.
const stubEncrypt = vi.fn().mockResolvedValue({
  v: 1 as const,
  iv: 'AAAAAAAAAAAAAAAA',         // 16-char base64url (12 bytes)
  ciphertext: 'AQIDBA',           // base64url of [1,2,3,4]
});

let client: { putDoc: ReturnType<typeof vi.fn>; getDoc: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; deleteDoc: ReturnType<typeof vi.fn>; };
let deps: EngineDeps;

beforeEach(() => {
  vi.useFakeTimers();
  stubEncrypt.mockClear();
  client = {
    putDoc: vi.fn().mockResolvedValue({ revision: 5, updatedAt: '2026-04-27T12:00:00Z' }),
    getDoc: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    deleteDoc: vi.fn(),
  };
  deps = {
    syncId: 'sync-id-1',
    client: client as unknown as SyncClient,
    // Encrypt is stubbed below — the engine never reaches the real
    // crypto.subtle path, so a sentinel CryptoKey-shaped value is fine
    // here. Cast keeps the test free of slow Web Crypto setup.
    K_enc: { type: 'secret', extractable: false } as unknown as CryptoKey,
    buildBundle: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    applyBundle: vi.fn(),
    getDocLastRevision: vi.fn().mockReturnValue(4),
    setDocLastRevision: vi.fn(),
    encrypt: stubEncrypt,
  };
  setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 4 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('engine push state machine', () => {
  it('markDirty transitions IDLE → PENDING immediately', () => {
    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    expect(docStatusFor('doc-1').kind).toBe('pending');
  });

  it('after debounce elapses, PENDING → SYNCING → IDLE on PUT 200', async () => {
    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    expect(docStatusFor('doc-1').kind).toBe('pending');

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(client.putDoc).toHaveBeenCalledTimes(1);
    expect(client.putDoc).toHaveBeenCalledWith(
      'sync-id-1',
      'doc-1',
      expect.objectContaining({
        v: 1,
        iv: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        ciphertext: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        expectedRevision: 4,
      }),
    );

    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('idle');
    if (s.kind === 'idle') {
      expect(s.revision).toBe(5);
    }
    expect(deps.setDocLastRevision).toHaveBeenCalledWith('doc-1', 5);
  });

  it('multiple markDirty within debounce window collapse to a single PUT', async () => {
    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(2_000);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(2_000);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    expect(client.putDoc).toHaveBeenCalledTimes(1);
  });

  it('two different docs both push independently', async () => {
    const engine = createEngine(deps);
    setDocStatus('doc-2', { kind: 'idle', lastSyncedAt: 0, revision: 7 });
    (deps.getDocLastRevision as ReturnType<typeof vi.fn>) = vi.fn().mockImplementation((id: string) => id === 'doc-1' ? 4 : 7);

    engine.markDirty('doc-1');
    engine.markDirty('doc-2');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(client.putDoc).toHaveBeenCalledTimes(2);
  });

  it('stop() cancels pending debounce timers', async () => {
    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    engine.stop();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await vi.runAllTimersAsync();
    expect(client.putDoc).not.toHaveBeenCalled();
  });
});

describe('engine push errors', () => {
  it('409 transitions to CONFLICT with serverRevision', async () => {
    client.putDoc.mockReset();
    client.putDoc.mockRejectedValueOnce(new SyncHttpError(409, { currentRevision: 7 }));
    deps.getDocLastRevision = vi.fn().mockReturnValue(4);

    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('conflict');
    if (s.kind === 'conflict') {
      expect(s.localRevision).toBe(4);
      expect(s.serverRevision).toBe(7);
    }
  });

  it('5xx retries with exponential backoff and eventually gives up', async () => {
    client.putDoc.mockReset();
    client.putDoc.mockRejectedValue(new SyncHttpError(503, null));

    const engine = createEngine(deps);
    engine.markDirty('doc-1');

    // First push attempt happens after debounce; advance by each retry delay
    // sequentially so we can confirm all 7 attempts fire before ERROR.
    // Total elapsed: DEBOUNCE_MS + 1 + 2 + 4 + 8 + 16 + 32 = DEBOUNCE_MS + 63s
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 63_000 + 1_000);
    await vi.runAllTimersAsync();

    // 1 initial + 6 retries = 7 attempts, then ERROR
    expect(client.putDoc).toHaveBeenCalledTimes(7);
    expect(docStatusFor('doc-1').kind).toBe('error');
  });

  it('5xx retry that eventually succeeds transitions to IDLE', async () => {
    client.putDoc.mockReset();
    client.putDoc
      .mockRejectedValueOnce(new SyncHttpError(503, null))
      .mockRejectedValueOnce(new SyncHttpError(503, null))
      .mockResolvedValueOnce({ revision: 5, updatedAt: '2026-04-27T12:00:00Z' });

    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    // First retry after 1s
    await vi.advanceTimersByTimeAsync(1_100);
    await vi.runAllTimersAsync();
    // Second retry after 2s
    await vi.advanceTimersByTimeAsync(2_100);
    await vi.runAllTimersAsync();

    expect(client.putDoc).toHaveBeenCalledTimes(3);
    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('idle');
    if (s.kind === 'idle') expect(s.revision).toBe(5);
  });

  it('non-409, non-5xx error transitions immediately to ERROR (no retry)', async () => {
    client.putDoc.mockReset();
    client.putDoc.mockRejectedValueOnce(new SyncHttpError(401, { error: 'auth_mismatch' }));

    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    // Wait long enough that retries WOULD have fired
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.runAllTimersAsync();

    expect(client.putDoc).toHaveBeenCalledTimes(1);
    expect(docStatusFor('doc-1').kind).toBe('error');
  });
});

// helper to build a stub EncryptedBlob — synchronous-resolving like the encrypt stub
function stubEncryptedBlob(): EncryptedBlob {
  return { v: 1, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'BBBBBBBB' };
}

describe('engine heartbeat + pull', () => {
  beforeEach(() => {
    // Make sure offline-detection treats us as online by default
    if (typeof navigator === 'undefined') {
      vi.stubGlobal('navigator', { onLine: true });
    }
  });

  it('idle doc pulls when server revision is higher', async () => {
    client.list.mockResolvedValueOnce([{ docId: 'doc-1', revision: 9, updatedAt: '' }]);
    client.getDoc.mockResolvedValueOnce({ ...stubEncryptedBlob(), revision: 9, updatedAt: '' });
    deps.decrypt = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    deps.getDocLastRevision = vi.fn().mockReturnValue(4);
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 4 });

    const engine = createEngine(deps);
    engine.start();
    // Advance to fire the interval once; advanceTimersByTimeAsync drains microtasks inline.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    // Stop the engine so runAllTimersAsync doesn't infinite-loop on the setInterval.
    engine.stop();
    await vi.runAllTimersAsync();

    expect(client.getDoc).toHaveBeenCalledWith('sync-id-1', 'doc-1');
    expect(deps.applyBundle).toHaveBeenCalledTimes(1);
    expect(deps.setDocLastRevision).toHaveBeenCalledWith('doc-1', 9);
    expect(docStatusFor('doc-1').kind).toBe('idle');
  });

  it('pending doc transitions to CONFLICT when server moved ahead', async () => {
    client.list.mockResolvedValueOnce([{ docId: 'doc-1', revision: 9, updatedAt: '' }]);
    deps.getDocLastRevision = vi.fn().mockReturnValue(4);
    setDocStatus('doc-1', { kind: 'pending' });

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    engine.stop();
    await vi.runAllTimersAsync();

    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('conflict');
    if (s.kind === 'conflict') {
      expect(s.localRevision).toBe(4);
      expect(s.serverRevision).toBe(9);
    }
    expect(client.getDoc).not.toHaveBeenCalled();
  });

  it('skips pull when local revision is already at server revision', async () => {
    client.list.mockResolvedValueOnce([{ docId: 'doc-1', revision: 4, updatedAt: '' }]);
    deps.getDocLastRevision = vi.fn().mockReturnValue(4);
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 4 });

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    engine.stop();
    await vi.runAllTimersAsync();

    expect(client.getDoc).not.toHaveBeenCalled();
  });

  it('skips heartbeat when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    engine.stop();
    await vi.runAllTimersAsync();

    expect(client.list).not.toHaveBeenCalled();

    vi.stubGlobal('navigator', { onLine: true });
  });

  it('stop() prevents future heartbeats from firing', async () => {
    client.list.mockResolvedValue([]);

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    // Drain the first heartbeat's async work without running the interval again.
    await vi.advanceTimersByTimeAsync(0);
    expect(client.list).toHaveBeenCalledTimes(1);

    engine.stop();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    await vi.runAllTimersAsync();
    expect(client.list).toHaveBeenCalledTimes(1); // no new calls after stop
  });
});

describe('engine heartbeat orphan detection', () => {
  beforeEach(() => {
    if (typeof navigator === 'undefined') {
      vi.stubGlobal('navigator', { onLine: true });
    }
    setCircleStatus({ kind: 'active', syncId: 'sync-id-1' });
  });

  it('marks circle orphaned and stops heartbeats on 401 from list', async () => {
    client.list.mockRejectedValueOnce(new SyncHttpError(401, { error: 'auth_mismatch' }));

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(circleStatus()).toEqual({ kind: 'orphaned', syncId: 'sync-id-1' });

    // No further polls — even after multiple intervals elapse.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    await vi.runAllTimersAsync();
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it('marks circle orphaned on legacy 404 unknown_circle from list', async () => {
    client.list.mockRejectedValueOnce(new SyncHttpError(404, { error: 'unknown_circle' }));

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(circleStatus()).toEqual({ kind: 'orphaned', syncId: 'sync-id-1' });
  });

  it('keeps polling on transient 429 / 5xx without orphaning', async () => {
    client.list
      .mockRejectedValueOnce(new SyncHttpError(429, { error: 'rate_limited' }))
      .mockRejectedValueOnce(new SyncHttpError(503, { error: 'unavailable' }))
      .mockResolvedValue([]);

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-1' });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-1' });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.list).toHaveBeenCalledTimes(3);

    engine.stop();
    await vi.runAllTimersAsync();
  });

  it('keeps polling on plain network errors (non-SyncHttpError)', async () => {
    client.list
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue([]);

    const engine = createEngine(deps);
    engine.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'sync-id-1' });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.list).toHaveBeenCalledTimes(2);

    engine.stop();
    await vi.runAllTimersAsync();
  });
});

describe('engine syncNow', () => {
  it('flushes pending debounce immediately and runs heartbeat', async () => {
    client.list.mockResolvedValueOnce([]);
    client.putDoc.mockResolvedValueOnce({ revision: 5, updatedAt: '2026-04-27T12:00:00Z' });

    const engine = createEngine(deps);
    engine.markDirty('doc-1');
    expect(docStatusFor('doc-1').kind).toBe('pending');

    // Don't advance time — call syncNow immediately
    await engine.syncNow();
    await vi.runAllTimersAsync();

    expect(client.putDoc).toHaveBeenCalledTimes(1);   // pending push flushed
    expect(client.list).toHaveBeenCalledTimes(1);     // heartbeat ran
  });
});

describe('engine conflict resolution', () => {
  beforeEach(() => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 4, serverRevision: 9 });
    deps.getDocLastRevision = vi.fn().mockReturnValue(4);
  });

  it('keepLocal re-PUTs with expectedRevision = serverRevision and lands IDLE', async () => {
    client.putDoc.mockReset();
    client.putDoc.mockResolvedValueOnce({ revision: 10, updatedAt: '2026-04-27T12:00:00Z' });

    const engine = createEngine(deps);
    await engine.resolveConflict('doc-1', 'keepLocal');

    expect(client.putDoc).toHaveBeenCalledTimes(1);
    expect(client.putDoc).toHaveBeenCalledWith(
      'sync-id-1',
      'doc-1',
      expect.objectContaining({ expectedRevision: 9 }),
    );
    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('idle');
    if (s.kind === 'idle') expect(s.revision).toBe(10);
    expect(deps.setDocLastRevision).toHaveBeenCalledWith('doc-1', 10);
  });

  it('pullServer downloads, decrypts, applies, lands IDLE', async () => {
    client.getDoc.mockReset();
    client.getDoc.mockResolvedValueOnce({ v: 1, iv: 'AA', ciphertext: 'BB', revision: 9, updatedAt: '2026-04-27T12:00:00Z' });
    deps.decrypt = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    const engine = createEngine(deps);
    await engine.resolveConflict('doc-1', 'pullServer');

    expect(deps.applyBundle).toHaveBeenCalledTimes(1);
    expect(deps.setDocLastRevision).toHaveBeenCalledWith('doc-1', 9);
    expect(docStatusFor('doc-1').kind).toBe('idle');
  });

  it('decideLater is a no-op (doc stays in CONFLICT)', async () => {
    client.putDoc.mockReset();
    client.getDoc.mockReset();

    const engine = createEngine(deps);
    await engine.resolveConflict('doc-1', 'decideLater');

    expect(client.putDoc).not.toHaveBeenCalled();
    expect(client.getDoc).not.toHaveBeenCalled();
    expect(docStatusFor('doc-1').kind).toBe('conflict');
  });

  it('saveAsCopy throws (caller must handle the clone)', async () => {
    const engine = createEngine(deps);
    await expect(engine.resolveConflict('doc-1', 'saveAsCopy'))
      .rejects.toThrow(/saveAsCopy/);
  });

  it('resolveConflict on a non-CONFLICT doc is a no-op', async () => {
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 5 });
    client.putDoc.mockReset();

    const engine = createEngine(deps);
    await engine.resolveConflict('doc-1', 'keepLocal');

    expect(client.putDoc).not.toHaveBeenCalled();
    expect(docStatusFor('doc-1').kind).toBe('idle');
  });
});
