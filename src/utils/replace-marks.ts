import type { Mark } from '@/types';

/**
 * Re-base inline marks across a substring replacement in a block's
 * content. Used by Find&Replace.
 *
 * Marks fully BEFORE the matched range are kept verbatim. Marks fully
 * AFTER are shifted by the length delta. Marks that OVERLAP the match
 * are dropped — for v1 Find&Replace this beats trying to compute
 * partial coverage, which gets ambiguous when the user is rewriting
 * the very text the mark applies to.
 */
export function shiftMarksForReplace(
  marks: Mark[] | undefined,
  matchStart: number,
  matchEnd: number,
  replacementLength: number,
): Mark[] {
  if (!marks || marks.length === 0) return [];
  const delta = replacementLength - (matchEnd - matchStart);
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.end <= matchStart) {
      out.push({ ...m });
    } else if (m.start >= matchEnd) {
      out.push({ ...m, start: m.start + delta, end: m.end + delta });
    }
    // overlap → drop.
  }
  return out;
}
