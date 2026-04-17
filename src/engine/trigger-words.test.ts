import { describe, it, expect } from 'vitest';
import { TRIGGER_WORDS, triggerCategories } from './trigger-words';

describe('TRIGGER_WORDS', () => {
  it('defines en and hu language entries', () => {
    expect(TRIGGER_WORDS.en).toBeDefined();
    expect(TRIGGER_WORDS.hu).toBeDefined();
  });

  it('all three categories are non-empty in each language', () => {
    for (const lang of ['en', 'hu'] as const) {
      expect(TRIGGER_WORDS[lang].kinship.length).toBeGreaterThan(0);
      expect(TRIGGER_WORDS[lang].body.length).toBeGreaterThan(0);
      expect(TRIGGER_WORDS[lang].profession.length).toBeGreaterThan(0);
    }
  });

  it('no English word overlaps between categories', () => {
    const seen = new Map<string, string>();
    for (const cat of ['kinship', 'body', 'profession'] as const) {
      for (const word of TRIGGER_WORDS.en[cat]) {
        const prior = seen.get(word);
        if (prior) {
          throw new Error(`"${word}" duplicated in en.${prior} and en.${cat}`);
        }
        seen.set(word, cat);
      }
    }
  });
});

describe('triggerCategories', () => {
  it('finds kinship words in English sentences', () => {
    const cats = triggerCategories('His brother Pyotr was there.', 'en');
    expect([...cats]).toContain('kinship');
  });

  it('finds body words in English sentences', () => {
    const cats = triggerCategories('Her eyes were green.', 'en');
    expect([...cats]).toContain('body');
  });

  it('finds profession words in English sentences', () => {
    const cats = triggerCategories('The doctor arrived late.', 'en');
    expect([...cats]).toContain('profession');
  });

  it('returns an empty set when no triggers match', () => {
    const cats = triggerCategories('The sky was clear that morning.', 'en');
    expect([...cats]).toEqual([]);
  });

  it('matches whole words only — "father" does not match "fatherland"', () => {
    const cats = triggerCategories('She loved her fatherland.', 'en');
    expect([...cats]).not.toContain('kinship');
  });

  it('is case-insensitive', () => {
    const cats = triggerCategories('His BROTHER arrived.', 'en');
    expect([...cats]).toContain('kinship');
  });

  it('detects Hungarian kinship with accented letters', () => {
    const cats = triggerCategories('A nővére tegnap jött.', 'hu');
    expect([...cats]).toContain('kinship');
  });

  it('respects Hungarian word boundaries', () => {
    // "szem" = eye; "szemtelen" = cheeky — must not false-match
    const cats = triggerCategories('Szemtelen gyerek volt.', 'hu');
    expect([...cats]).not.toContain('body');
  });

  it('returns all matching categories when multiple triggers are present', () => {
    const cats = triggerCategories('Her brother, a doctor, had blue eyes.', 'en');
    expect([...cats].sort()).toEqual(['body', 'kinship', 'profession']);
  });
});
