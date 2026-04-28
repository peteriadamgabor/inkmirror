/**
 * Dev-mode gate for the threshold-tuning developer menu.
 *
 * Reads `localStorage['inkmirror.dev']` once at module load and
 * compares against the compiled-in passphrase. The result is exposed
 * as a Solid signal so UI surfaces (CommandPalette entry, header
 * badge) reactively render or hide themselves.
 *
 * Reload required after toggling the localStorage key — the signal
 * is initialised once at boot. This is intentional: the dev menu is
 * not a user-facing feature, the friction discourages accidental
 * activation, and a single read keeps the production hot path free
 * of repeated localStorage hits.
 *
 * The passphrase is mangled by the minifier but findable on close
 * inspection. This is friction, not a security boundary — nothing
 * in the dev menu is sensitive.
 */

import { createSignal, type Accessor } from 'solid-js';

const STORAGE_KEY = 'inkmirror.dev';
const PASSPHRASE = 'two-hearts-one-soul';

function readEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === PASSPHRASE;
  } catch {
    // Storage access can throw in private-mode Safari and some test
    // harnesses. Fail closed — dev mode stays off.
    return false;
  }
}

const [enabled, setEnabled] = createSignal(readEnabled());

export const isDevModeEnabled: Accessor<boolean> = enabled;

/**
 * Disables dev mode by clearing the localStorage key. The signal
 * flips false immediately so the UI can react, but the modal still
 * suggests a reload so the lazy-loaded DevMenu chunk drops out of
 * the active page (its module-level state would otherwise linger).
 */
export function disableDevMode(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — best-effort.
  }
  setEnabled(false);
}

/** Test-only: re-read the storage value to refresh the signal. */
export function _refreshDevMode(): void {
  setEnabled(readEnabled());
}
