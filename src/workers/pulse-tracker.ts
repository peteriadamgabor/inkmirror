// Keystroke aggregation worker. Receives "key" events from the main thread
// and computes rolling metrics (WPM, burst rate, total keys) on demand.
// Pure reducer is exported for unit testing; the worker runtime is only wired
// when the file is loaded in a real Worker context.

export interface PulseState {
  events: number[]; // recent keystroke timestamps (ms)
  totalKeys: number;
  sessionStartedAt: number;
}

export interface PulseMetrics {
  wpm: number;
  burstRate: number; // keys/sec over last 5s
  totalKeys: number;
  sessionStartedAt: number;
}

export type PulseMessage =
  | { type: 'key'; t?: number }
  | { type: 'snapshot' }
  | { type: 'reset' };

export type PulseReply = { type: 'metrics' } & PulseMetrics;

const WINDOW_MS = 60_000;
const BURST_WINDOW_MS = 5_000;
const CHARS_PER_WORD = 5;

export function createPulseState(now: number): PulseState {
  return { events: [], totalKeys: 0, sessionStartedAt: now };
}

export function handle(
  state: PulseState,
  msg: PulseMessage,
  now: number,
): { state: PulseState; reply: PulseReply | null } {
  switch (msg.type) {
    case 'key': {
      const t = msg.t ?? now;
      return {
        state: {
          ...state,
          events: [...state.events, t],
          totalKeys: state.totalKeys + 1,
        },
        reply: null,
      };
    }
    case 'snapshot': {
      const pruned = state.events.filter((t) => now - t < WINDOW_MS);
      const burstKeys = pruned.filter((t) => now - t < BURST_WINDOW_MS).length;
      const burstRate = burstKeys / (BURST_WINDOW_MS / 1000);
      // wpm over last 60s: chars/5 (word) then per minute
      const windowSeconds = Math.min(WINDOW_MS / 1000, (now - state.sessionStartedAt) / 1000 || 1);
      const wpm = (pruned.length / CHARS_PER_WORD) * (60 / windowSeconds);
      return {
        state: { ...state, events: pruned },
        reply: {
          type: 'metrics',
          wpm,
          burstRate,
          totalKeys: state.totalKeys,
          sessionStartedAt: state.sessionStartedAt,
        },
      };
    }
    case 'reset': {
      return { state: createPulseState(now), reply: null };
    }
  }
}

// Worker runtime: only active inside a real Worker (self is DedicatedWorkerGlobalScope).
// Skipped under vitest/jsdom where this file is imported as a module.
declare const self: DedicatedWorkerGlobalScope;
if (
  typeof self !== 'undefined' &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function'
) {
  let state = createPulseState(Date.now());
  self.addEventListener('message', (e: MessageEvent<PulseMessage>) => {
    const next = handle(state, e.data, Date.now());
    state = next.state;
    if (next.reply) self.postMessage(next.reply);
  });
}
