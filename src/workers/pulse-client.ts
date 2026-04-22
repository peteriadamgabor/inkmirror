// Main-thread client for the pulse-tracker Worker. The worker is created
// lazily on first keystroke so tests and the boot path stay cheap.

import type { PulseMetrics, PulseReply } from './pulse-tracker';

export type { PulseMetrics };

let worker: Worker | null = null;
let lastMetrics: PulseMetrics | null = null;
let failed = false;

// Lightweight subscription slot for listeners that care about "user is
// actively typing" signals. The pulse worker is the canonical source for
// keystroke events; other modules (idle-driven consistency scan) can
// subscribe here instead of attaching their own DOM keydown listener.
type KeystrokeListener = () => void;
const keystrokeListeners = new Set<KeystrokeListener>();

export function subscribeToKeystrokes(cb: KeystrokeListener): () => void {
  keystrokeListeners.add(cb);
  return () => keystrokeListeners.delete(cb);
}

function ensureWorker(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined') {
    failed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./pulse-tracker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<PulseReply>) => {
      if (e.data?.type === 'metrics') {
        lastMetrics = e.data;
      }
    });
  } catch {
    failed = true;
    worker = null;
  }
  return worker;
}

export function recordKeystroke(): void {
  const w = ensureWorker();
  if (w) w.postMessage({ type: 'key', t: Date.now() });
  // Notify subscribers even when the worker couldn't spin up — the
  // idle scheduler still works without WPM metrics.
  for (const cb of keystrokeListeners) {
    try {
      cb();
    } catch {
      /* listener failure must not break the keystroke pipe */
    }
  }
}

export function requestPulseSnapshot(): void {
  const w = ensureWorker();
  if (!w) return;
  w.postMessage({ type: 'snapshot' });
}

export function resetPulse(): void {
  const w = ensureWorker();
  if (!w) return;
  w.postMessage({ type: 'reset' });
  lastMetrics = null;
}

export function getLastPulseMetrics(): PulseMetrics | null {
  return lastMetrics;
}
