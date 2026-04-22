/**
 * Idle-driven consistency-scan scheduler for the Near tier.
 *
 * Listens for typing activity via the pulse-client subscription slot,
 * fires a `runConsistencyScan` after the user has been idle for
 * `IDLE_MS`, and aborts the in-flight scan when they start typing
 * again. A cooldown prevents re-running the full pipeline back-to-back.
 *
 * No priority queue yet — MVP runs a full-manuscript scan on every
 * idle transition that clears the cooldown. A `characterId` priority
 * queue is a future optimization if scan time becomes a real problem.
 */

import { subscribeToKeystrokes } from '@/workers/pulse-client';
import { store } from '@/store/document';
import { runConsistencyScan, isScanRunning } from './inconsistency';
import { getStoredProfile } from './profile';

/** How long without keystrokes before we consider the writer "paused". */
const IDLE_MS = 15_000;
/** Minimum gap between scans, measured from scan start. */
const SCAN_COOLDOWN_MS = 120_000;

interface SchedulerDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
  scan: typeof runConsistencyScan;
  isRunning: typeof isScanRunning;
  getProfile: () => string;
  getDocumentId: () => string | null;
  getCharacterCount: () => number;
}

interface IdleScheduler {
  notifyTypingActivity: () => void;
  /** Test hook — trigger the idle fire immediately. */
  fireIdleNow: () => Promise<void>;
  stop: () => void;
}

function createScheduler(deps: SchedulerDeps): IdleScheduler {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;
  // Initialized such that the first idle fire always passes the
  // cooldown check — a freshly-booted session should be eligible for
  // an immediate scan once the writer sits still.
  let lastScanAt = deps.now() - SCAN_COOLDOWN_MS;
  let stopped = false;

  function resetIdleTimer(): void {
    if (stopped) return;
    if (idleTimer) deps.clearTimer(idleTimer);
    idleTimer = deps.setTimer(onIdle, IDLE_MS);
  }

  async function onIdle(): Promise<void> {
    idleTimer = null;
    if (stopped) return;
    if (deps.getProfile() !== 'deep') return;
    if (deps.isRunning()) return;
    if (deps.now() - lastScanAt < SCAN_COOLDOWN_MS) return;
    if (!deps.getDocumentId()) return;
    if (deps.getCharacterCount() === 0) return;

    const controller = new AbortController();
    activeController = controller;
    lastScanAt = deps.now();
    try {
      await deps.scan({ signal: controller.signal });
    } finally {
      if (activeController === controller) activeController = null;
    }
  }

  function notifyTypingActivity(): void {
    if (stopped) return;
    // User resumed typing — abort the in-flight scan so the NLI worker
    // isn't pinned while they're actively editing. `runConsistencyScan`
    // already checks `signal.aborted` between pairs and bails cleanly.
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    resetIdleTimer();
  }

  async function fireIdleNow(): Promise<void> {
    if (idleTimer) {
      deps.clearTimer(idleTimer);
      idleTimer = null;
    }
    await onIdle();
  }

  function stop(): void {
    stopped = true;
    if (idleTimer) {
      deps.clearTimer(idleTimer);
      idleTimer = null;
    }
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  }

  // Kick off the initial idle timer so a user who loads the app and
  // doesn't type for 15s still gets a scan.
  resetIdleTimer();

  return { notifyTypingActivity, fireIdleNow, stop };
}

let singleton: IdleScheduler | null = null;
let unsubscribe: (() => void) | null = null;

export function registerIdleScheduler(): void {
  if (singleton) return;
  singleton = createScheduler({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h),
    scan: runConsistencyScan,
    isRunning: isScanRunning,
    getProfile: () => getStoredProfile(),
    getDocumentId: () => store.document?.id ?? null,
    getCharacterCount: () => store.characters.length,
  });
  const s = singleton;
  unsubscribe = subscribeToKeystrokes(() => s.notifyTypingActivity());
}

export function resetIdleScheduler(): void {
  if (singleton) {
    singleton.stop();
    singleton = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// ---------- test-only exports ----------

export const __testing = {
  createScheduler,
  IDLE_MS,
  SCAN_COOLDOWN_MS,
};
