import { describe, it, expect } from 'vitest';
import { resolveMoodLabel } from './engine';

describe('resolveMoodLabel', () => {
  it('passes through legacy 3-class labels', () => {
    expect(resolveMoodLabel('positive')).toBe('positive');
    expect(resolveMoodLabel('neutral')).toBe('neutral');
    expect(resolveMoodLabel('negative')).toBe('negative');
  });
  it('passes through all 10 Near tier moods', () => {
    for (const m of ['tender','tension','dread','longing','grief','hope','joy','wonder','rage','calm']) {
      expect(resolveMoodLabel(m)).toBe(m);
    }
  });
  it('falls back to neutral for unknown labels', () => {
    expect(resolveMoodLabel('bogus')).toBe('neutral');
    expect(resolveMoodLabel(null)).toBe('neutral');
    expect(resolveMoodLabel(undefined)).toBe('neutral');
    expect(resolveMoodLabel('')).toBe('neutral');
  });
});
