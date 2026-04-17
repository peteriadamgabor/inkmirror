import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PROFILE_STORAGE_KEY,
  getStoredProfile,
  setStoredProfile,
  detectBackend,
  type AiProfile,
} from './profile';

describe('AiProfile persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to lightweight when no stored value', () => {
    expect(getStoredProfile()).toBe('lightweight');
  });

  it('defaults to lightweight when stored value is garbage', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'vintage-premium');
    expect(getStoredProfile()).toBe('lightweight');
  });

  it('round-trips deep', () => {
    setStoredProfile('deep');
    expect(getStoredProfile()).toBe('deep');
  });

  it('round-trips lightweight', () => {
    setStoredProfile('deep');
    setStoredProfile('lightweight');
    expect(getStoredProfile()).toBe('lightweight');
  });

  it('type-check: AiProfile union', () => {
    const p: AiProfile = 'lightweight';
    expect(p).toBe('lightweight');
  });
});

describe('detectBackend', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');

  function restoreNavigator() {
    if (originalDescriptor) {
      Object.defineProperty(globalThis.navigator, 'gpu', originalDescriptor);
    } else {
      delete (globalThis.navigator as unknown as { gpu?: unknown }).gpu;
    }
  }

  it('returns wasm when navigator.gpu is absent', async () => {
    delete (globalThis.navigator as unknown as { gpu?: unknown }).gpu;
    expect(await detectBackend()).toBe('wasm');
    restoreNavigator();
  });

  it('returns wasm when requestAdapter returns null', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
    });
    expect(await detectBackend()).toBe('wasm');
    restoreNavigator();
  });

  it('returns wasm when requestAdapter rejects', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockRejectedValue(new Error('no adapter')),
      },
    });
    expect(await detectBackend()).toBe('wasm');
    restoreNavigator();
  });

  it('returns webgpu when requestAdapter resolves with an adapter', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue({ features: new Set() }),
      },
    });
    expect(await detectBackend()).toBe('webgpu');
    restoreNavigator();
  });
});
