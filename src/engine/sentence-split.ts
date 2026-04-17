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
      // Don't break — keep accumulating into the current sentence.
      continue;
    }

    if (candidate) out.push(candidate);
    start = match.index + match[0].length;
  }

  // Trailing fragment without a terminator
  const tail = collapsed.slice(start).trim();
  if (tail) out.push(tail);

  return out;
}

function isAbbreviation(sentence: string): boolean {
  // Grab the last whitespace-delimited token before the terminator.
  const trimmed = sentence.replace(TRAILING_TERMINATOR, '').trimEnd();
  const lastSpace = trimmed.lastIndexOf(' ');
  const token = (lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed).toLowerCase();
  return ABBREVIATIONS.has(token);
}
