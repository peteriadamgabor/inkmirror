// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { WORDLIST, generatePassphrase } from './wordlist';

describe('WORDLIST shape', () => {
  it('contains exactly 256 entries (so byte-indexed picks are unbiased)', () => {
    expect(WORDLIST.length).toBe(256);
  });

  it('contains no duplicates', () => {
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
  });

  it('contains only lowercase ASCII letters, 3–8 chars', () => {
    for (const w of WORDLIST) {
      expect(w).toMatch(/^[a-z]{3,8}$/);
    }
  });
});

describe('generatePassphrase', () => {
  it('returns the requested word count joined with hyphens', () => {
    const p = generatePassphrase(8);
    const parts = p.split('-');
    expect(parts.length).toBe(8);
    for (const w of parts) expect(WORDLIST).toContain(w);
  });

  it('default produces 8 words', () => {
    expect(generatePassphrase().split('-').length).toBe(8);
  });

  it('produces different output across calls (probabilistic)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generatePassphrase());
    expect(seen.size).toBeGreaterThan(45);
  });

  it('rejects count < 1', () => {
    expect(() => generatePassphrase(0)).toThrow();
  });
});
