import { describe, it, expect } from 'vitest';
import { computeVisible } from './virtualizer';

describe('computeVisible', () => {
  it('returns empty range for empty input', () => {
    const out = computeVisible({
      blockHeights: [],
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 5,
    });
    expect(out).toEqual({
      firstIndex: 0,
      lastIndex: -1,
      offsetTop: 0,
      totalHeight: 0,
    });
  });

  it('computes totalHeight as sum of blockHeights', () => {
    const out = computeVisible({
      blockHeights: [100, 200, 50, 150],
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 0,
    });
    expect(out.totalHeight).toBe(500);
  });

  it('includes all visible blocks at scrollTop=0', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100],
      scrollTop: 0,
      viewportHeight: 250,
      overscan: 0,
    });
    expect(out.firstIndex).toBe(0);
    expect(out.lastIndex).toBe(2); // 0,1,2 — third block is partially visible
    expect(out.offsetTop).toBe(0);
  });

  it('skips blocks above the viewport', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100],
      scrollTop: 250,
      viewportHeight: 100,
      overscan: 0,
    });
    // scrollTop 250 → block 2 starts at 200, so first visible is block 2
    expect(out.firstIndex).toBe(2);
    expect(out.offsetTop).toBe(200);
  });

  it('applies overscan on both sides', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100, 100, 100],
      scrollTop: 250,
      viewportHeight: 100,
      overscan: 1,
    });
    // without overscan: first=2, last=3. With overscan 1: first=1, last=4.
    expect(out.firstIndex).toBe(1);
    expect(out.lastIndex).toBe(4);
    expect(out.offsetTop).toBe(100); // offset is first block's top
  });

  it('clamps overscan at array boundaries', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100],
      scrollTop: 0,
      viewportHeight: 100,
      overscan: 10,
    });
    expect(out.firstIndex).toBe(0);
    expect(out.lastIndex).toBe(2);
  });

  it('clamps when scrollTop is past the end', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100],
      scrollTop: 10000,
      viewportHeight: 100,
      overscan: 0,
    });
    expect(out.firstIndex).toBe(2);
    expect(out.lastIndex).toBe(2);
  });
});
