import { describe, it, expect } from 'vitest';
import { labelHex, labelValence, labelI18nKey, SENTIMENT_HEX } from './label-helpers';
import { MOOD_HUE } from '@/types';

describe('labelHex', () => {
  it('returns sentiment hex for light labels', () => {
    expect(labelHex('positive')).toBe(SENTIMENT_HEX.positive);
    expect(labelHex('neutral')).toBe(SENTIMENT_HEX.neutral);
    expect(labelHex('negative')).toBe(SENTIMENT_HEX.negative);
  });

  it('returns mood hex for deep labels', () => {
    expect(labelHex('tender')).toBe(MOOD_HUE.tender);
    expect(labelHex('rage')).toBe(MOOD_HUE.rage);
    expect(labelHex('longing')).toBe(MOOD_HUE.longing);
  });

  it('returns a muted color for null / unknown', () => {
    expect(labelHex(null)).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(labelHex(undefined)).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(labelHex('not-a-label')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('labelValence', () => {
  it('maps light labels directly', () => {
    expect(labelValence('positive')).toBe('positive');
    expect(labelValence('negative')).toBe('negative');
    expect(labelValence('neutral')).toBe('neutral');
  });

  it('maps moods via MOOD_VALENCE', () => {
    expect(labelValence('joy')).toBe('positive');
    expect(labelValence('grief')).toBe('negative');
    expect(labelValence('longing')).toBe('neutral');
  });

  it('unknown labels fall back to neutral', () => {
    expect(labelValence('bogus')).toBe('neutral');
    expect(labelValence(null)).toBe('neutral');
    expect(labelValence(undefined)).toBe('neutral');
  });
});

describe('labelI18nKey', () => {
  it('prefixes mood namespace for known labels', () => {
    expect(labelI18nKey('tender')).toBe('mood.tender');
    expect(labelI18nKey('positive')).toBe('mood.positive');
  });

  it('falls back to mood.unanalyzed for unknown', () => {
    expect(labelI18nKey('bogus')).toBe('mood.unanalyzed');
  });
});
