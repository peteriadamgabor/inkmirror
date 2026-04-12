import { describe, it, expect, vi } from 'vitest';
import {
  createStubMeasurer,
  createMemoizedMeasurer,
  createPretextMeasurer,
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

// Skipped under JSDOM: @chenglou/pretext requires a real Canvas
// (OffscreenCanvas or DOM <canvas>.getContext('2d')), and JSDOM does not
// implement HTMLCanvasElement.prototype.getContext without the native
// `canvas` npm package. The pretext backend will be validated manually in
// the Task 14 perf harness, which runs in a real browser.
// See docs/pretext-research.md.
describe.skip('createPretextMeasurer (integration)', () => {
  it('measures a non-empty string without throwing', () => {
    const m = createPretextMeasurer();
    const r = m.measure({
      text: 'The quick brown fox jumps over the lazy dog.',
      font: '16px Georgia',
      width: 600,
      lineHeight: 1.8,
    });
    expect(r.height).toBeGreaterThan(0);
    expect(r.lineCount).toBeGreaterThanOrEqual(1);
  });
});
