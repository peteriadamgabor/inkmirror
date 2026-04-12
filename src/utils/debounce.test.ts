import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls the function once after the wait elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('forwards arguments from the latest call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d('a');
    d('b');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('b');
  });
});
