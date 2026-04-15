// Main-thread client for the pulse-tracker Worker. The worker is created
// lazily on first keystroke so tests and the boot path stay cheap.

import type { PulseMetrics, PulseReply } from './pulse-tracker';

let worker: Worker | null = null;
let lastMetrics: PulseMetrics | null = null;
let failed = false;

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
  if (!w) return;
  w.postMessage({ type: 'key', t: Date.now() });
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
