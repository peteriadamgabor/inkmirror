import { describe, it, expect } from 'vitest';
import {
  MOODS,
  MOOD_VALENCE,
  MOOD_HUE,
  isMood,
  classifyLabel,
  type Mood,
} from './mood';

describe('mood vocabulary', () => {
  it('exposes exactly 10 labels', () => {
    expect(MOODS).toHaveLength(10);
  });

  it('every mood has a valence', () => {
    for (const m of MOODS) {
      expect(MOOD_VALENCE[m]).toMatch(/positive|negative|neutral/);
    }
  });

  it('every mood has a hex hue', () => {
    for (const m of MOODS) {
      expect(MOOD_HUE[m]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('valence breakdown matches spec', () => {
    const positive = MOODS.filter((m) => MOOD_VALENCE[m] === 'positive');
    const negative = MOODS.filter((m) => MOOD_VALENCE[m] === 'negative');
    const neutral = MOODS.filter((m) => MOOD_VALENCE[m] === 'neutral');
    expect(positive).toEqual(
      expect.arrayContaining(['joy', 'hope', 'tender', 'wonder', 'calm']),
    );
    expect(negative).toEqual(
      expect.arrayContaining(['dread', 'grief', 'rage', 'tension']),
    );
    expect(neutral).toEqual(['longing']);
  });

  it('isMood type guard accepts valid moods', () => {
    expect(isMood('tender')).toBe(true);
    expect(isMood('rage')).toBe(true);
  });

  it('isMood rejects unknown labels', () => {
    expect(isMood('happy')).toBe(false);
    expect(isMood('positive')).toBe(false);
    expect(isMood('')).toBe(false);
    expect(isMood(undefined)).toBe(false);
  });

  it('classifyLabel routes moods to deep, 3-class to light, unknown to null', () => {
    expect(classifyLabel('tender')).toEqual({ source: 'deep', mood: 'tender' });
    expect(classifyLabel('positive')).toEqual({ source: 'light', valence: 'positive' });
    expect(classifyLabel('neutral')).toEqual({ source: 'light', valence: 'neutral' });
    expect(classifyLabel('negative')).toEqual({ source: 'light', valence: 'negative' });
    expect(classifyLabel('bogus')).toBeNull();
  });

  it('Mood type fully enumerates MOODS', () => {
    const m: Mood = 'rage';
    expect(MOODS).toContain(m);
  });
});
