import { describe, it, expect, vi } from 'vitest';
import {
  createStubMeasurer,
  createMemoizedMeasurer,
  DEFAULT_BLOCK_HEIGHT,
  type Measurer,
} from './measure';

describe('createStubMeasurer', () => {
  it('returns DEFAULT_BLOCK_HEIGHT for empty string', () => {
    const m = createStubMeasurer();
    const r = m.measure({ text: '', font: '16px serif', width: 600, lineHeight: 1.8 });
    expect(r.height).toBe(DEFAULT_BLOCK_HEIGHT);
    expect(r.lineCount).toBe(1);
  });

  it('scales height with text length (deterministic stub)', () => {
    const m = createStubMeasurer();
    const short = m.measure({ text: 'hello', font: '16px serif', width: 600, lineHeight: 1.8 });
    const long = m.measure({ text: 'x'.repeat(1000), font: '16px serif', width: 600, lineHeight: 1.8 });
    expect(long.height).toBeGreaterThan(short.height);
  });
});

describe('createMemoizedMeasurer', () => {
  it('delegates on first call, caches on second', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    const input = { text: 'abc', font: '16px serif', width: 600, lineHeight: 1.8 };

    const r1 = memoized.measure(input);
    const r2 = memoized.measure(input);

    expect(backend.measure).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it('invalidates cache when content changes', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    memoized.measure({ text: 'a', font: 'f', width: 600, lineHeight: 1.8 });
    memoized.measure({ text: 'b', font: 'f', width: 600, lineHeight: 1.8 });
    expect(backend.measure).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache when width changes', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    memoized.measure({ text: 'abc', font: 'f', width: 600, lineHeight: 1.8 });
    memoized.measure({ text: 'abc', font: 'f', width: 800, lineHeight: 1.8 });
    expect(backend.measure).toHaveBeenCalledTimes(2);
  });
});
