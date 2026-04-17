/**
 * Unicode-aware sentence splitter for prose.
 *
 * Designed to be good enough for inconsistency detection — not to be a
 * perfect NLP tokenizer. Each sentence becomes a candidate NLI input,
 * so over-splitting is worse than under-splitting (small context hurts
 * NLI accuracy). The abbreviation safelist keeps common titles and
 * short-forms from breaking prose mid-thought.
 */

// Common abbreviations whose period should NOT end a sentence. All kept
// lowercase — lookup normalizes the token before comparing.
const ABBREVIATIONS = new Set([
  // English titles / forms of address
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  // English reference / measurement
  'fig', 'vol', 'no', 'vs', 'etc', 'e.g', 'i.e', 'pp', 'cf',
  // Hungarian titles / common abbreviations
  'pl', 'ill', 'kb', 'stb', 'vö', 'ún', 'uo',
]);

const TRAILING_TERMINATOR = /[.!?…]+["'")\]]?$/;
const TERMINATOR_REGEX = /[.!?…]+["'")\]]?\s+/g;

/** Hard cap on a single emitted sentence. Anything longer is force-cut
 * to keep downstream regex / NLI passes O(n) in document size, not
 * O(n × longest-sentence). 4096 chars covers every realistic prose
 * sentence with comfortable room for long Hungarian compounds. */
const MAX_SENTENCE_CHARS = 4096;

function pushBounded(out: string[], sentence: string): void {
  if (sentence.length <= MAX_SENTENCE_CHARS) {
    out.push(sentence);
    return;
  }
  // Cut on the nearest whitespace before the cap, falling back to a
  // hard cut. Drop the tail — anything beyond MAX_SENTENCE_CHARS in a
  // single un-terminated run is almost certainly noise (minified blob,
  // pathological input), not prose worth analyzing.
  const slice = sentence.slice(0, MAX_SENTENCE_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  out.push(lastSpace > MAX_SENTENCE_CHARS / 2 ? slice.slice(0, lastSpace) : slice);
}

export function splitSentences(input: string): string[] {
  // Normalize runs of whitespace (including newlines) to single spaces.
  const collapsed = input.replace(/\s+/g, ' ').trim();
  if (!collapsed) return [];

  const out: string[] = [];
  let start = 0;
  TERMINATOR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TERMINATOR_REGEX.exec(collapsed)) !== null) {
    const end = match.index + match[0].trimEnd().length;
    const candidate = collapsed.slice(start, end).trim();

    if (candidate && isAbbreviation(candidate)) {
      // Abbreviation: keep accumulating into the current sentence.
      // BUT: if the candidate has grown past MAX_SENTENCE_CHARS the
      // accumulator is doing more harm than good — force-emit and
      // restart so we stay O(n) overall.
      if (candidate.length > MAX_SENTENCE_CHARS) {
        pushBounded(out, candidate);
        start = match.index + match[0].length;
      }
      continue;
    }

    if (candidate) pushBounded(out, candidate);
    start = match.index + match[0].length;
  }

  // Trailing fragment without a terminator
  const tail = collapsed.slice(start).trim();
  if (tail) pushBounded(out, tail);

  return out;
}

function isAbbreviation(sentence: string): boolean {
  // Grab the last whitespace-delimited token before the terminator.
  const trimmed = sentence.replace(TRAILING_TERMINATOR, '').trimEnd();
  const lastSpace = trimmed.lastIndexOf(' ');
  const token = (lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed).toLowerCase();
  return ABBREVIATIONS.has(token);
}
