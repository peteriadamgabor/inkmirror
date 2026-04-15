import { describe, it, expect } from 'vitest';
import { createPulseState, handle } from './pulse-tracker';

describe('pulse-tracker reducer', () => {
  it('accumulates keystrokes', () => {
    let state = createPulseState(0);
    for (let i = 0; i < 10; i++) {
      state = handle(state, { type: 'key', t: i * 10 }, i * 10).state;
    }
    expect(state.totalKeys).toBe(10);
    expect(state.events).toHaveLength(10);
  });

  it('computes burst rate and WPM over recent window', () => {
    let state = createPulseState(0);
    // 50 keys at 1ms intervals, all within burst window
    for (let i = 0; i < 50; i++) {
      state = handle(state, { type: 'key', t: i }, i).state;
    }
    const { reply } = handle(state, { type: 'snapshot' }, 50);
    expect(reply).not.toBeNull();
    expect(reply!.totalKeys).toBe(50);
    expect(reply!.burstRate).toBeGreaterThan(0);
    expect(reply!.wpm).toBeGreaterThan(0);
  });

  it('prunes events older than the 60s window on snapshot', () => {
    let state = createPulseState(0);
    state = handle(state, { type: 'key', t: 0 }, 0).state;
    state = handle(state, { type: 'key', t: 70_000 }, 70_000).state;
    const { state: after } = handle(state, { type: 'snapshot' }, 70_000);
    // Only the second event should survive pruning.
    expect(after.events).toEqual([70_000]);
    // totalKeys is cumulative and is not pruned.
    expect(after.totalKeys).toBe(2);
  });

  it('resets session on reset', () => {
    let state = createPulseState(0);
    state = handle(state, { type: 'key', t: 1 }, 1).state;
    state = handle(state, { type: 'key', t: 2 }, 2).state;
    const after = handle(state, { type: 'reset' }, 1000).state;
    expect(after.totalKeys).toBe(0);
    expect(after.events).toHaveLength(0);
    expect(after.sessionStartedAt).toBe(1000);
  });
});
