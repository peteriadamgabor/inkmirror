/**
 * Storage durability helpers.
 *
 * Closes the quiet hole in the local-first promise: under disk pressure
 * the browser is free to evict IndexedDB without warning. Two pieces:
 *
 *   - `estimate()` — surfaces used / quota numbers so the writer can
 *     see how much room they have before a write fails silently.
 *   - `requestPersistence()` / `isPersisted()` — opts the origin into
 *     "persistent" storage, which means eviction requires explicit user
 *     action (clear data, uninstall PWA) instead of "best effort."
 *
 * Both APIs degrade gracefully on browsers that don't ship them
 * (Safari historically, very old engines). Callers must tolerate
 * `null` / `false` and not break the boot path.
 */

export interface StorageEstimate {
  /** Bytes the origin currently uses across all storage APIs. */
  usedBytes: number;
  /** Best-effort total bytes the origin is allowed (browser-set). */
  quotaBytes: number;
  /** 0..1, used / quota, clamped. `null` when quota is missing. */
  fraction: number | null;
}

/**
 * Read the origin's current storage usage. Returns `null` when the
 * Storage API isn't available (older Safari, restricted contexts).
 */
export async function estimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const e = await storage.estimate();
    const used = typeof e.usage === 'number' ? e.usage : 0;
    const quota = typeof e.quota === 'number' ? e.quota : 0;
    const fraction =
      quota > 0 ? Math.min(1, Math.max(0, used / quota)) : null;
    return { usedBytes: used, quotaBytes: quota, fraction };
  } catch {
    return null;
  }
}

/**
 * Whether the origin is already in persistent-storage mode. Treat
 * `false` as "best-effort" — your data is at the browser's mercy
 * under disk pressure.
 */
export async function isPersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const storage = navigator.storage;
  if (!storage || typeof storage.persisted !== 'function') return false;
  try {
    return await storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Ask the browser to upgrade the origin to persistent storage.
 *
 * Behavior varies:
 *   - Chrome / Edge: often grant silently when engagement is high or
 *     the app is installed as a PWA. May also auto-deny.
 *   - Firefox: prompts the user.
 *   - Safari: typically returns `false` regardless (best-effort only).
 *
 * Returns whether persistence is now active.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== 'function') return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/**
 * Render bytes as a short human-readable string. Used in the Settings
 * line — not a localised number; keep the unit suffix machine-stable
 * so screenshots stay legible across releases.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIdx]}`;
}

// ---------- ask-once tracking for the persist prompt ----------
//
// The backlog item is explicit: "One ask per moment, store the result,
// never nag." We record the outcome of the most recent ask so the
// export-flow trigger doesn't re-fire after every export, and we don't
// re-ask on every boot.

const ASK_KEY = 'inkmirror.storage.persistAsked';

export type PersistAskOutcome = 'granted' | 'denied' | 'unsupported';

interface PersistAskRecord {
  outcome: PersistAskOutcome;
  /** ISO timestamp — useful if we ever decide to re-ask after, say, six
   *  months of denied + heavy usage. Not used today. */
  at: string;
}

export function readPersistAskRecord(): PersistAskRecord | null {
  try {
    const raw = localStorage.getItem(ASK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistAskRecord>;
    if (
      (parsed.outcome === 'granted' ||
        parsed.outcome === 'denied' ||
        parsed.outcome === 'unsupported') &&
      typeof parsed.at === 'string'
    ) {
      return { outcome: parsed.outcome, at: parsed.at };
    }
    return null;
  } catch {
    return null;
  }
}

function writePersistAskRecord(outcome: PersistAskOutcome): void {
  try {
    localStorage.setItem(
      ASK_KEY,
      JSON.stringify({ outcome, at: new Date().toISOString() }),
    );
  } catch {
    // localStorage can throw under privacy modes; the in-memory flow
    // already returned the right answer, just no persistence. The next
    // run may re-ask once.
  }
}

export function clearPersistAskRecord(): void {
  try {
    localStorage.removeItem(ASK_KEY);
  } catch {
    // ignore — best effort
  }
}

/**
 * High-level "ask if it makes sense" wrapper used by the export flow.
 *
 * - If the API is unsupported or already granted, return immediately
 *   (no nag).
 * - If we've already asked once and got a sticky outcome (granted or
 *   denied), return the recorded outcome — no nag.
 * - Otherwise call `navigator.storage.persist()` once, record the
 *   outcome, and return it.
 *
 * The "Request again" button on the Settings panel calls
 * `requestPersistence()` directly so the user can override a prior
 * deny — this helper is only for opportunistic asks.
 */
export async function askPersistenceOnce(): Promise<PersistAskOutcome> {
  if (await isPersisted()) {
    writePersistAskRecord('granted');
    return 'granted';
  }
  // Detect support without firing the prompt.
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.persist !== 'function'
  ) {
    writePersistAskRecord('unsupported');
    return 'unsupported';
  }
  const recorded = readPersistAskRecord();
  if (recorded) return recorded.outcome;
  const granted = await requestPersistence();
  const outcome: PersistAskOutcome = granted ? 'granted' : 'denied';
  writePersistAskRecord(outcome);
  return outcome;
}
