/**
 * Lightweight sentence extraction.
 *
 * Shared by the Last Words / First Lines view (a chapter's opening and
 * closing line) and Session memory (the last line the writer committed).
 * This is deliberately NOT a full NLP tokenizer — it splits on terminal
 * punctuation (`.`, `!`, `?`, `…`, and runs like `...`/`?!`), keeping any
 * trailing closing quote or bracket attached to the sentence it ends.
 *
 * Known imperfection: abbreviations ("Mr.", "St.", "i.e.") will over-split.
 * For surfacing a single opening or closing line in a quiet panel that's an
 * acceptable trade — the same punctuation rules work for English and
 * Hungarian, and a fragment with no terminator is returned whole.
 */

// One or more terminal marks, then any run of closing quotes/brackets, then
// whitespace or end-of-string. The closing-quote group keeps `…"` / `.»`
// together instead of orphaning the quote onto the next sentence.
const SENTENCE_BOUNDARY = /([.!?…]+)(["'”’»)\]]*)(?=\s|$)/g;

/**
 * Split text into sentences. Soft line breaks and runs of whitespace are
 * collapsed to single spaces first, so a block written across several lines
 * reads as continuous prose. Returns `[]` for empty / whitespace-only input.
 */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const out: string[] = [];
  let start = 0;
  SENTENCE_BOUNDARY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_BOUNDARY.exec(normalized)) !== null) {
    const end = match.index + match[1].length + match[2].length;
    const sentence = normalized.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }
  // Trailing fragment with no terminator is still a sentence.
  const tail = normalized.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** First sentence, or the whole trimmed text when there's no terminator. */
export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? '';
}

/** Last sentence, or the whole trimmed text when there's no terminator. */
export function lastSentence(text: string): string {
  const sentences = splitSentences(text);
  return sentences.length ? sentences[sentences.length - 1] : '';
}
