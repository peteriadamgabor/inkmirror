/**
 * Passphrase strength classifier for the sync setup flow.
 *
 * The threshold model assumes the passphrase will be passed through Argon2id
 * MODERATE (~1 s/guess) before becoming K_master. We're not trying to catch
 * every weak password in the world — we're trying to keep someone with a
 * leaked auth_proof+salt from cracking offline within a few CPU-days.
 *
 * Rules:
 *   - Reject too-short (< 14 chars). Even a strong character mix below this
 *     length leaks too much under Argon2id MODERATE on a GPU rig.
 *   - Reject anything that matches (case-insensitive) a known common-password
 *     pattern: short repeats like "aaaaaaaaaaaaaa", common phrases like
 *     "password1234", keyboard runs like "qwertyuiop". This is a small,
 *     opinionated list — not a full breach corpus.
 *   - Above 14 chars + not on the deny list, classify by length tiers.
 */

const MIN_LENGTH_HARD = 14;

/** Lowercased substrings that disqualify a passphrase regardless of length. */
const DENYLIST_SUBSTRINGS: readonly string[] = [
  'password',
  'passw0rd',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'iloveyou',
  '12345678',
  '87654321',
  'letmein',
  'monkey123',
  'admin123',
  'inkmirror',
];

/** Catches sequences like "aaaaa" or "11111" — 6+ identical chars in a row. */
const REPEATED_CHAR_RE = /(.)\1{5,}/;

export function passphraseStrength(pw: string): 'weak' | 'medium' | 'strong' {
  if (pw.length < MIN_LENGTH_HARD) return 'weak';

  const lower = pw.toLowerCase();
  if (REPEATED_CHAR_RE.test(lower)) return 'weak';
  for (const bad of DENYLIST_SUBSTRINGS) {
    if (lower.includes(bad)) return 'weak';
  }

  // Reject if all characters are the same alphabet class AND there's only
  // a handful of distinct chars — "abcabcabcabcabc" type passphrases.
  const distinct = new Set(lower).size;
  if (distinct < 6) return 'weak';

  if (pw.length < 24) return 'medium';
  return 'strong';
}
