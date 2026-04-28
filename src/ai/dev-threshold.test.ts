import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLD,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  _refreshThreshold,
  getContradictionThreshold,
  isThresholdOverridden,
  resetContradictionThreshold,
  setContradictionThreshold,
} from './dev-threshold';

const KEY = 'inkmirror.dev.threshold';

describe('dev-threshold', () => {
  beforeEach(() => {
    localStorage.clear();
    _refreshThreshold();
  });

  afterEach(() => {
    localStorage.clear();
    _refreshThreshold();
  });

  it('returns the default when no override is stored', () => {
    expect(getContradictionThreshold()).toBe(DEFAULT_THRESHOLD);
    expect(isThresholdOverridden()).toBe(false);
  });

  it('returns the stored override when one is set', () => {
    setContradictionThreshold(0.6);
    expect(getContradictionThreshold()).toBe(0.6);
    expect(isThresholdOverridden()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('0.6');
  });

  it('clamps writes below the floor', () => {
    setContradictionThreshold(0.05);
    expect(getContradictionThreshold()).toBe(MIN_THRESHOLD);
  });

  it('clamps writes above the ceiling', () => {
    setContradictionThreshold(1.5);
    expect(getContradictionThreshold()).toBe(MAX_THRESHOLD);
  });

  it('coerces NaN to default', () => {
    setContradictionThreshold(Number.NaN);
    expect(getContradictionThreshold()).toBe(DEFAULT_THRESHOLD);
  });

  it('falls through to default when localStorage holds a non-numeric value', () => {
    localStorage.setItem(KEY, 'banana');
    _refreshThreshold();
    expect(getContradictionThreshold()).toBe(DEFAULT_THRESHOLD);
    expect(isThresholdOverridden()).toBe(false);
  });

  it('resetContradictionThreshold clears storage and signal', () => {
    setContradictionThreshold(0.5);
    expect(isThresholdOverridden()).toBe(true);

    resetContradictionThreshold();
    expect(isThresholdOverridden()).toBe(false);
    expect(getContradictionThreshold()).toBe(DEFAULT_THRESHOLD);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clamps stored values that drift outside the range', () => {
    localStorage.setItem(KEY, '2.5');
    _refreshThreshold();
    expect(getContradictionThreshold()).toBe(MAX_THRESHOLD);
    expect(isThresholdOverridden()).toBe(true);
  });
});
