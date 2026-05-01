export type WordDiffSegmentKind = 'equal' | 'add' | 'remove';

export interface WordDiffSegment {
  kind: WordDiffSegmentKind;
  text: string;
}

const TOKEN_RE = /(\s+|[.,;:!?—–"'''""()…\[\]{}])/;

function tokenize(s: string): string[] {
  if (s.length === 0) return [];
  return s.split(TOKEN_RE).filter((t) => t.length > 0);
}

/**
 * Hunt–McIlroy LCS over word tokens. O(n*m) time/space, but n and m are
 * token counts not character counts, so for typical block content this is
 * fast enough to run in the popover on demand.
 */
export function diffWords(prev: string, next: string): WordDiffSegment[] {
  const a = tokenize(prev);
  const b = tokenize(next);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ kind: 'add', text: b.join('') }];
  if (b.length === 0) return [{ kind: 'remove', text: a.join('') }];

  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack into a list of {kind, text} ops, in reverse.
  const ops: WordDiffSegment[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'equal', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ kind: 'add', text: b[j - 1] });
      j--;
    } else {
      ops.push({ kind: 'remove', text: a[i - 1] });
      i--;
    }
  }
  ops.reverse();

  // Coalesce adjacent same-kind segments so renderers don't get confetti.
  const coalesced: WordDiffSegment[] = [];
  for (const seg of ops) {
    const last = coalesced[coalesced.length - 1];
    if (last && last.kind === seg.kind) {
      last.text += seg.text;
    } else {
      coalesced.push({ ...seg });
    }
  }
  return coalesced;
}

/** Number of non-equal segments — the threshold for the major-rewrite fallback. */
export function countSegments(segs: WordDiffSegment[]): number {
  return segs.filter((s) => s.kind !== 'equal').length;
}
