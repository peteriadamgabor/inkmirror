/**
 * AI profile state for the Near tier.
 *
 * `'lightweight'` (default): distilbert 3-class sentiment. Small, already-loaded.
 * `'deep'`: mDeBERTa zero-shot + NLI. Opt-in one-time download, unlocks rich
 * moods and inconsistency detection.
 *
 * Profile persists across sessions via localStorage AND is exposed as a
 * reactive Solid signal so components that gate on the profile re-render
 * when the user flips it in Settings.
 */

import { createSignal, type Accessor } from 'solid-js';

export type AiProfile = 'lightweight' | 'deep';

export type AiBackend = 'webgpu' | 'wasm';

export const PROFILE_STORAGE_KEY = 'inkmirror.aiProfile';

const VALID_PROFILES: readonly AiProfile[] = ['lightweight', 'deep'];

function readFromStorage(): AiProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw && (VALID_PROFILES as readonly string[]).includes(raw)) {
      return raw as AiProfile;
    }
  } catch {
    // localStorage can throw under privacy modes; default through.
  }
  return 'lightweight';
}

const [profileSignal, setProfileSignal] = createSignal<AiProfile>(readFromStorage());

/**
 * Reactive accessor — Solid components that read this re-run when the
 * profile changes. Equivalent to `store.profile()` if we had a store.
 */
export const profile: Accessor<AiProfile> = profileSignal;

/**
 * Plain read (non-reactive) — prefer `profile()` inside Solid scopes.
 * Kept for call sites outside reactive contexts (worker setup, etc.).
 */
export function getStoredProfile(): AiProfile {
  return profileSignal();
}

export function setStoredProfile(next: AiProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, next);
  } catch {
    // swallow — opt-in failure surfaces elsewhere
  }
  setProfileSignal(next);
}

/**
 * Async backend detection that actually verifies a GPU adapter is available.
 *
 * `'gpu' in navigator` is INSUFFICIENT — Chromium on Linux frequently exposes
 * the GPU namespace but returns null from requestAdapter(). The PoC on
 * 2026-04-17 confirmed this concretely; the wasm path must handle the
 * majority of Linux users.
 */
export async function detectBackend(): Promise<AiBackend> {
  const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return 'wasm';
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
