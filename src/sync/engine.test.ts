// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEngine, type EngineDeps, DEBOUNCE_MS } from './engine';
import { docStatusFor, setDocStatus } from './state';
import type { SyncClient } from './client';

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
    K_enc: crypto.getRandomValues(new Uint8Array(32)),
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
