import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askPersistenceOnce,
  clearPersistAskRecord,
  estimate,
  formatBytes,
  isPersisted,
  readPersistAskRecord,
  requestPersistence,
} from './storage';

interface MockStorage {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

function stubLocalStorage() {
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

function stubNavigatorStorage(storage: MockStorage | null) {
  vi.stubGlobal('navigator', {
    ...((globalThis as unknown as { navigator?: object }).navigator ?? {}),
    storage,
  });
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('estimate', () => {
  it('returns null when navigator.storage is missing', async () => {
    stubNavigatorStorage(null);
    expect(await estimate()).toBeNull();
  });

  it('returns the used / quota / fraction triple', async () => {
    stubNavigatorStorage({
      estimate: async () => ({ usage: 250 * 1024 * 1024, quota: 1000 * 1024 * 1024 }),
    });
    const e = await estimate();
    expect(e).not.toBeNull();
    expect(e!.usedBytes).toBe(250 * 1024 * 1024);
    expect(e!.quotaBytes).toBe(1000 * 1024 * 1024);
    expect(e!.fraction).toBeCloseTo(0.25);
  });

  it('clamps fraction to [0, 1] when reported usage exceeds quota', async () => {
    stubNavigatorStorage({
      estimate: async () => ({ usage: 1500, quota: 1000 }),
    });
    const e = await estimate();
    expect(e!.fraction).toBe(1);
  });

  it('returns null fraction when quota is zero/missing', async () => {
    stubNavigatorStorage({ estimate: async () => ({ usage: 100 }) });
    const e = await estimate();
    expect(e!.fraction).toBeNull();
  });

  it('returns null when the estimate call throws', async () => {
    stubNavigatorStorage({
      estimate: async () => { throw new Error('denied'); },
    });
    expect(await estimate()).toBeNull();
  });
});

describe('isPersisted / requestPersistence', () => {
  it('isPersisted returns false when API missing', async () => {
    stubNavigatorStorage(null);
    expect(await isPersisted()).toBe(false);
  });

  it('isPersisted forwards the API result', async () => {
    stubNavigatorStorage({ persisted: async () => true });
    expect(await isPersisted()).toBe(true);
  });

  it('requestPersistence returns false when API missing', async () => {
    stubNavigatorStorage(null);
    expect(await requestPersistence()).toBe(false);
  });

  it('requestPersistence forwards the grant result', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubNavigatorStorage({ persist });
    expect(await requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe('askPersistenceOnce', () => {
  it('returns granted immediately when already persisted, without prompting', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubNavigatorStorage({
      persisted: async () => true,
      persist,
    });
    expect(await askPersistenceOnce()).toBe('granted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns unsupported when the API is missing', async () => {
    stubNavigatorStorage(null);
    expect(await askPersistenceOnce()).toBe('unsupported');
    expect(readPersistAskRecord()?.outcome).toBe('unsupported');
  });

  it('records granted on first successful ask and does not re-ask later', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubNavigatorStorage({
      persisted: async () => false,
      persist,
    });
    expect(await askPersistenceOnce()).toBe('granted');
    expect(persist).toHaveBeenCalledOnce();
    expect(readPersistAskRecord()?.outcome).toBe('granted');

    // Second call: should NOT call persist again, returns the recorded outcome.
    expect(await askPersistenceOnce()).toBe('granted');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('records denied on rejected ask and does not nag the user repeatedly', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    stubNavigatorStorage({
      persisted: async () => false,
      persist,
    });
    expect(await askPersistenceOnce()).toBe('denied');
    expect(persist).toHaveBeenCalledOnce();

    // The whole point: don't ask again until the user explicitly clicks
    // "Request again" in Settings (which uses requestPersistence directly).
    expect(await askPersistenceOnce()).toBe('denied');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('clearPersistAskRecord resets the ask state so the next call re-prompts', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    stubNavigatorStorage({
      persisted: async () => false,
      persist,
    });
    await askPersistenceOnce();
    expect(persist).toHaveBeenCalledOnce();
    clearPersistAskRecord();
    await askPersistenceOnce();
    expect(persist).toHaveBeenCalledTimes(2);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [10 * 1024, '10 KB'],
    [1024 * 1024, '1.0 MB'],
    [250 * 1024 * 1024, '250 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
    [-1, '0 B'],
  ])('formatBytes(%i) → %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
