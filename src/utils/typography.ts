/**
 * Auto-typography on input. Operates on a single Text node and rewrites
 * a few common digraphs into the proper Unicode glyph as the writer
 * types, returning the new caret offset within that node.
 *
 * Replacements:
 *   `--`  → `—` (em-dash) — always
 *   `...` → `…` (ellipsis) — always
 *   `"`   → `“` / `”`     — only when smartQuotes is true
 *   `'`   → `‘` / `’`     — only when smartQuotes is true
 *
 * Triple-character lookahead guards (`offset >= 3 && prev !== '-'`) keep
 * us from re-triggering on `---` or `....` so the writer can still
 * deliberately type a long dash row or a quadruple ellipsis without the
 * helper fighting them.
 *
 * Smart-quote opening/closing decision is purely contextual: if the char
 * before the typed quote is whitespace or an opening bracket, treat it
 * as opening; otherwise closing. This is what makes `I'm` produce a
 * closing `’` and `'Hello'` produce an opening `‘`.
 */
export function applyTypographyReplacement(
  textNode: Text,
  offset: number,
  smartQuotes: boolean,
): { offset: number; replaced: boolean } {
  const data = textNode.data;

  // Em-dash: `--` collapses to `—`, but only the first time. A third
  // dash (`---`) or trailing dash after `—-` should not retrigger.
  if (offset >= 2 && data[offset - 1] === '-' && data[offset - 2] === '-') {
    if (offset < 3 || data[offset - 3] !== '-') {
      textNode.data = data.slice(0, offset - 2) + '—' + data.slice(offset);
      return { offset: offset - 1, replaced: true };
    }
  }

  // Ellipsis: `...` collapses to `…`. Same lookahead guard.
  if (offset >= 3 && data.slice(offset - 3, offset) === '...') {
    if (offset < 4 || data[offset - 4] !== '.') {
      textNode.data = data.slice(0, offset - 3) + '…' + data.slice(offset);
      return { offset: offset - 2, replaced: true };
    }
  }

  if (!smartQuotes) {
    return { offset, replaced: false };
  }

  if (offset >= 1) {
    const last = data[offset - 1];
    if (last === '"' || last === "'") {
      const prev = offset >= 2 ? data[offset - 2] : '';
      // Open when there's no prior char, or the prior char is whitespace
      // or an opening bracket / dash. Otherwise close.
      const isOpening = !prev || /[\s—–(\[{]/.test(prev);
      const replacement =
        last === '"'
          ? isOpening
            ? '“'
            : '”'
          : isOpening
            ? '‘'
            : '’';
      textNode.data = data.slice(0, offset - 1) + replacement + data.slice(offset);
      return { offset, replaced: true };
    }
  }

  return { offset, replaced: false };
}
