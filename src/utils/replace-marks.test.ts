import { describe, it, expect } from 'vitest';
import { shiftMarksForReplace } from './replace-marks';
import type { Mark } from '@/types';

const bold = (start: number, end: number): Mark => ({ type: 'bold', start, end });

describe('shiftMarksForReplace', () => {
  it('returns [] for undefined or empty marks', () => {
    expect(shiftMarksForReplace(undefined, 0, 3, 5)).toEqual([]);
    expect(shiftMarksForReplace([], 0, 3, 5)).toEqual([]);
  });

  it('keeps marks fully before the match unchanged', () => {
    const out = shiftMarksForReplace([bold(0, 3)], 5, 8, 4);
    expect(out).toEqual([bold(0, 3)]);
  });

  it('shifts marks fully after the match by the length delta', () => {
    const out = shiftMarksForReplace([bold(10, 15)], 0, 3, 5);
    expect(out).toEqual([bold(12, 17)]);
  });

  it('shifts negatively when the replacement is shorter', () => {
    const out = shiftMarksForReplace([bold(10, 15)], 0, 5, 2);
    expect(out).toEqual([bold(7, 12)]);
  });

  it('drops marks that overlap the match', () => {
    const out = shiftMarksForReplace([bold(2, 6)], 4, 8, 4);
    expect(out).toEqual([]);
  });

  it('handles a touch-at-edge correctly (mark.end == matchStart is "before")', () => {
    const out = shiftMarksForReplace([bold(0, 4)], 4, 8, 4);
    expect(out).toEqual([bold(0, 4)]);
  });

  it('handles a touch-at-edge correctly (mark.start == matchEnd is "after")', () => {
    const out = shiftMarksForReplace([bold(8, 12)], 4, 8, 6);
    // delta = 6 - (8-4) = 2, so [8,12] → [10,14]
    expect(out).toEqual([bold(10, 14)]);
  });

  it('preserves multiple non-overlapping marks across one replacement', () => {
    const marks = [bold(0, 2), bold(10, 12), bold(20, 22)];
    const out = shiftMarksForReplace(marks, 5, 8, 6);
    // delta = 6 - 3 = 3
    expect(out).toEqual([bold(0, 2), bold(13, 15), bold(23, 25)]);
  });
});
