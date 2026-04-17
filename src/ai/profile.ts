/**
 * AI profile state for the Near tier.
 *
 * `'lightweight'` (default): distilbert 3-class sentiment. Small, already-loaded.
 * `'deep'`: mDeBERTa zero-shot + NLI. Opt-in one-time download, unlocks rich
 * moods and inconsistency detection.
 *
 * Profile persists across sessions via localStorage.
 */

export type AiProfile = 'lightweight' | 'deep';

export type AiBackend = 'webgpu' | 'wasm';

export const PROFILE_STORAGE_KEY = 'inkmirror.aiProfile';

const VALID_PROFILES: readonly AiProfile[] = ['lightweight', 'deep'];

export function getStoredProfile(): AiProfile {
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

export function setStoredProfile(profile: AiProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, profile);
  } catch {
    // swallow — opt-in failure surfaces elsewhere
  }
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
