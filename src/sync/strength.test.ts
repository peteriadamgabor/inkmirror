// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { passphraseStrength } from './strength';
import { generatePassphrase } from './wordlist';

describe('passphraseStrength', () => {
  it('rejects under 14 chars as weak', () => {
    expect(passphraseStrength('short')).toBe('weak');
    expect(passphraseStrength('thirteen-char')).toBe('weak'); // 13 chars
  });

  it('rejects long but trivial repeats as weak', () => {
    expect(passphraseStrength('aaaaaaaaaaaaaaaaaaaa')).toBe('weak');
    expect(passphraseStrength('11111111111111111111')).toBe('weak');
  });

  it('rejects long but on-denylist as weak', () => {
    expect(passphraseStrength('mypasswordhere1234567')).toBe('weak');
    expect(passphraseStrength('qwertyuiopasdfgh1234')).toBe('weak');
    expect(passphraseStrength('inkmirror-is-the-best')).toBe('weak');
  });

  it('rejects too-few-distinct-chars as weak', () => {
    expect(passphraseStrength('abababababababab')).toBe('weak'); // only 2 distinct
    expect(passphraseStrength('abcabcabcabcabcabc')).toBe('weak'); // only 3 distinct
  });

  it('classifies medium-length acceptable passphrases as medium', () => {
    // 14 chars, 6+ distinct, no denylist hits, no 6-run repeats
    expect(passphraseStrength('horsebattery42')).toBe('medium');
  });

  it('classifies 24+ chars with diversity as strong', () => {
    expect(passphraseStrength('correct-horse-battery-staple')).toBe('strong');
  });

  it('the in-app generator always passes the strength gate', () => {
    // 8 words from a 256-word list joined with hyphens — minimum length is
    // ~5×8 + 7 = 47 chars; exceeds the strong threshold every time.
    for (let i = 0; i < 30; i++) {
      expect(passphraseStrength(generatePassphrase())).toBe('strong');
    }
  });
});
