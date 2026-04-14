import type { Character, UUID } from '@/types';

/**
 * Escape a string for safe use inside a RegExp. Covers all metacharacters.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex that matches any of the given needles as whole words.
 * Word boundaries are unicode-aware: a needle is a "whole word" if the
 * character immediately before and after is NOT a letter or number in
 * any script. This handles Hungarian (é, ő, ű, …) and all other scripts
 * correctly, unlike \b which is ASCII-only in JavaScript.
 *
 * Returns null if the needles list is empty.
 */
function buildMentionRegex(needles: string[]): RegExp | null {
  const cleaned = needles.map((n) => n.trim()).filter((n) => n.length > 0);
  if (cleaned.length === 0) return null;
  // Longer names first so "Réka-2" matches before "Réka" when both exist.
  cleaned.sort((a, b) => b.length - a.length);
  const pattern = cleaned.map(escapeRegExp).join('|');
  // (?<![\p{L}\p{N}]) = not preceded by a letter/number
  // (?![\p{L}\p{N}])  = not followed by a letter/number
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Return the ids of characters whose name or any alias appears in the text
 * as a whole word (unicode-aware, case-insensitive). Empty text or empty
 * character list returns an empty array.
 */
export function findMentions(text: string, characters: Character[]): UUID[] {
  if (!text || characters.length === 0) return [];
  const result: UUID[] = [];
  for (const char of characters) {
    const needles = [char.name, ...char.aliases];
    const re = buildMentionRegex(needles);
    if (!re) continue;
    if (re.test(text)) result.push(char.id);
  }
  return result;
}
