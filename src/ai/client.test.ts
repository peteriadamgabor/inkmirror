import { describe, it, expect, vi } from 'vitest';
import { createAiClient } from './client';

/**
 * Minimal mock Worker: captures posted messages and exposes a way to simulate
 * worker → main responses. Implements just enough of the Worker interface to
 * satisfy the client.
 */
class MockWorker {
  public posted: unknown[] = [];
  private messageListeners: Array<(ev: MessageEvent<unknown>) => void> = [];
  private errorListeners: Array<(ev: Event) => void> = [];

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }

  addEventListener(type: string, listener: unknown): void {
    if (type === 'message') {
      this.messageListeners.push(listener as (ev: MessageEvent<unknown>) => void);
    } else if (type === 'error') {
      this.errorListeners.push(listener as (ev: Event) => void);
    }
  }

  removeEventListener(): void {
    // no-op for the mock
  }

  terminate(): void {
    // no-op for the mock
  }

  emitMessage(data: unknown): void {
    const ev = { data } as MessageEvent<unknown>;
    for (const l of this.messageListeners) l(ev);
  }

  emitError(message: string): void {
    const ev = new Event('error') as ErrorEvent;
    Object.defineProperty(ev, 'message', { value: message });
    for (const l of this.errorListeners) l(ev);
  }
}

function make() {
  const worker = new MockWorker();
  const client = createAiClient({
    createWorker: () => worker as unknown as Worker,
  });
  return { worker, client };
}

describe('createAiClient', () => {
  it('starts not ready and not loading', () => {
    const { client } = make();
    expect(client.isReady()).toBe(false);
    expect(client.isLoading()).toBe(false);
    expect(client.loadError()).toBeNull();
  });

  it('preload posts a preload request', async () => {
    const { worker, client } = make();
    const promise = client.preload();
    expect(worker.posted).toHaveLength(1);
    const req = worker.posted[0] as { id: string; kind: string };
    expect(req.kind).toBe('preload');
    expect(typeof req.id).toBe('string');

    // Simulate worker success
    worker.emitMessage({ id: req.id, ok: true, result: null });
    await promise;
  });

  it('ready message flips isReady', async () => {
    const { worker, client } = make();
    // Worker is created lazily on first send; preload triggers ensureWorker.
    const preloadPromise = client.preload();
    expect(client.isReady()).toBe(false);
    worker.emitMessage({ kind: 'ready' });
    expect(client.isReady()).toBe(true);
    // Also resolve the preload request so the promise doesn't dangle.
    const req = worker.posted[0] as { id: string };
    worker.emitMessage({ id: req.id, ok: true, result: null });
    await preloadPromise;
  });

  it('detectLanguage returns the worker result', async () => {
    const { worker, client } = make();
    const promise = client.detectLanguage('hello');
    const req = worker.posted[0] as { id: string };
    const fakeResult = [{ label: 'en', score: 0.97 }];
    worker.emitMessage({ id: req.id, ok: true, result: fakeResult });
    const out = await promise;
    expect(out).toEqual(fakeResult);
  });

  it('normalizes a single-object result into an array', async () => {
    const { worker, client } = make();
    const promise = client.detectLanguage('hello');
    const req = worker.posted[0] as { id: string };
    worker.emitMessage({ id: req.id, ok: true, result: { label: 'en', score: 0.5 } });
    const out = await promise;
    expect(out).toEqual([{ label: 'en', score: 0.5 }]);
  });

  it('propagates worker errors as rejected promises', async () => {
    const { worker, client } = make();
    const promise = client.detectLanguage('oops');
    const req = worker.posted[0] as { id: string };
    worker.emitMessage({ id: req.id, ok: false, error: 'boom' });
    await expect(promise).rejects.toThrow('boom');
  });

  it('onerror rejects all pending requests', async () => {
    const { worker, client } = make();
    const p1 = client.detectLanguage('a').catch((e: unknown) => e);
    const p2 = client.detectLanguage('b').catch((e: unknown) => e);
    worker.emitError('worker died');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect((r1 as Error).message).toBe('worker died');
    expect((r2 as Error).message).toBe('worker died');
    expect(client.loadError()).toBe('worker died');
  });

  it('times out a hanging request', async () => {
    vi.useFakeTimers();
    try {
      const { client } = make();
      const promise = client.detectLanguage('hang');
      const caught = promise.catch((e: unknown) => e);
      vi.advanceTimersByTime(61_000);
      const err = (await caught) as Error;
      expect(err.message).toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
  });
});
