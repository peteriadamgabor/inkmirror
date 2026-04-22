import { describe, it, expect, vi } from 'vitest';
import { __testing } from './idle-scheduler';

const { createScheduler, IDLE_MS, SCAN_COOLDOWN_MS } = __testing;

interface Harness {
  scan: ReturnType<typeof vi.fn>;
  isRunning: ReturnType<typeof vi.fn>;
  profile: 'lightweight' | 'deep';
  docId: string | null;
  charCount: number;
  now: number;
  timers: Map<number, { fn: () => void; fireAt: number }>;
  nextTimerId: number;
}

function makeHarness(overrides: Partial<Harness> = {}): Harness {
  return {
    scan: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockReturnValue(false),
    profile: 'deep',
    docId: 'doc-1',
    charCount: 2,
    now: 1000,
    timers: new Map(),
    nextTimerId: 1,
    ...overrides,
  };
}

function makeScheduler(h: Harness) {
  return createScheduler({
    now: () => h.now,
    setTimer: (fn, _ms) => {
      const id = h.nextTimerId++;
      h.timers.set(id, { fn, fireAt: h.now + _ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (handle) => {
      h.timers.delete(handle as unknown as number);
    },
    scan: h.scan as unknown as typeof import('./inconsistency').runConsistencyScan,
    isRunning: h.isRunning as unknown as typeof import('./inconsistency').isScanRunning,
    getProfile: () => h.profile,
    getDocumentId: () => h.docId,
    getCharacterCount: () => h.charCount,
  });
}

describe('idle-scheduler', () => {
  it('fires a scan after idle with deep profile and characters present', async () => {
    const h = makeHarness();
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).toHaveBeenCalledTimes(1);
    expect(h.scan.mock.calls[0][0]?.signal).toBeInstanceOf(AbortSignal);
    s.stop();
  });

  it('skips when profile is lightweight', async () => {
    const h = makeHarness({ profile: 'lightweight' });
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).not.toHaveBeenCalled();
    s.stop();
  });

  it('skips when no document is loaded', async () => {
    const h = makeHarness({ docId: null });
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).not.toHaveBeenCalled();
    s.stop();
  });

  it('skips when there are no characters', async () => {
    const h = makeHarness({ charCount: 0 });
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).not.toHaveBeenCalled();
    s.stop();
  });

  it('skips when a scan is already running', async () => {
    const h = makeHarness({ isRunning: vi.fn().mockReturnValue(true) });
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).not.toHaveBeenCalled();
    s.stop();
  });

  it('respects the cooldown between scans', async () => {
    const h = makeHarness();
    const s = makeScheduler(h);
    await s.fireIdleNow();
    expect(h.scan).toHaveBeenCalledTimes(1);

    // Less than cooldown elapsed — skip.
    h.now += SCAN_COOLDOWN_MS - 1;
    await s.fireIdleNow();
    expect(h.scan).toHaveBeenCalledTimes(1);

    // Past cooldown — scan again.
    h.now += 2;
    await s.fireIdleNow();
    expect(h.scan).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('aborts an in-flight scan when the user types', async () => {
    const h = makeHarness();
    const captured: { signal: AbortSignal | null; resolve: (() => void) | null } = {
      signal: null,
      resolve: null,
    };
    h.scan = vi.fn().mockImplementation((opts) => {
      captured.signal = opts?.signal ?? null;
      return new Promise<void>((res) => {
        captured.resolve = res;
      });
    });
    const s = makeScheduler(h);
    const scanPromise = s.fireIdleNow();
    expect(h.scan).toHaveBeenCalledTimes(1);
    expect(captured.signal?.aborted).toBe(false);

    s.notifyTypingActivity();
    expect(captured.signal?.aborted).toBe(true);

    captured.resolve?.();
    await scanPromise;
    s.stop();
  });

  it('schedules an initial idle timer on creation', () => {
    const h = makeHarness();
    const s = makeScheduler(h);
    expect(h.timers.size).toBe(1);
    const [[, entry]] = h.timers.entries();
    expect(entry.fireAt).toBe(h.now + IDLE_MS);
    s.stop();
  });

  it('stop() aborts the active scan and clears timers', async () => {
    const h = makeHarness();
    const captured: { signal: AbortSignal | null; resolve: (() => void) | null } = {
      signal: null,
      resolve: null,
    };
    h.scan = vi.fn().mockImplementation((opts) => {
      captured.signal = opts?.signal ?? null;
      return new Promise<void>((res) => {
        captured.resolve = res;
      });
    });
    const s = makeScheduler(h);
    const scanPromise = s.fireIdleNow();
    expect(captured.signal?.aborted).toBe(false);
    s.stop();
    expect(captured.signal?.aborted).toBe(true);
    expect(h.timers.size).toBe(0);
    captured.resolve?.();
    await scanPromise;
  });
});
