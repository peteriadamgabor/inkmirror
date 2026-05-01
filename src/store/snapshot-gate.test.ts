import { describe, it, expect, beforeEach } from 'vitest';
import { shouldSnapshot, recordSnapshot, resetSnapshotTracking } from './snapshot-gate';
import { setRevisionPreset } from './revision-preset';

describe('snapshot-gate', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSnapshotTracking();
    setRevisionPreset('balanced'); // 60s / 30 chars
  });

  it('approves the first snapshot for a block when content is non-empty', () => {
    expect(shouldSnapshot('block-1', 'hello world')).toBe(true);
  });

  it('rejects empty content', () => {
    expect(shouldSnapshot('block-1', '')).toBe(false);
    expect(shouldSnapshot('block-1', '   ')).toBe(false);
  });

  it('rejects when time gate fails', () => {
    recordSnapshot('block-1', 'short', Date.now());
    expect(shouldSnapshot('block-1', 'this is much longer content past 30 chars')).toBe(false);
  });

  it('rejects when distance gate fails (length-delta below threshold)', () => {
    recordSnapshot('block-1', 'short text', Date.now() - 120_000);
    // length delta = 5, below 30
    expect(shouldSnapshot('block-1', 'short texts!!')).toBe(false);
  });

  it('approves when both gates pass', () => {
    recordSnapshot('block-1', 'short', Date.now() - 120_000);
    // length delta = 35
    expect(shouldSnapshot('block-1', 'short' + ' word'.repeat(7))).toBe(true);
  });

  it('reads the active preset on each call (no stale closure)', () => {
    recordSnapshot('block-1', 'short', Date.now() - 40_000);
    // 40s elapsed, balanced needs 60s → reject
    expect(shouldSnapshot('block-1', 'short' + ' word'.repeat(7))).toBe(false);
    // switch to frequent (30s) → now passes
    setRevisionPreset('frequent');
    expect(shouldSnapshot('block-1', 'short' + ' word'.repeat(7))).toBe(true);
  });

  it('tracks blocks independently', () => {
    recordSnapshot('block-1', 'a', Date.now());
    expect(shouldSnapshot('block-2', 'fresh content past 30 chars long')).toBe(true);
  });
});
