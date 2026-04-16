import type { Mark, MarkType } from '@/types/block';

const MARK_TYPES: MarkType[] = ['bold', 'italic'];

/** Stable nesting order for serialization — bold wraps italic. */
const TAG_ORDER: MarkType[] = ['bold', 'italic'];

/**
 * Merge touching / overlapping marks of the same type, drop empty
 * ranges, clip to [0, contentLength], and sort by start then type.
 */
export function normalizeMarks(marks: Mark[], contentLength: number): Mark[] {
  const out: Mark[] = [];
  for (const type of MARK_TYPES) {
    const ranges = marks
      .filter((m) => m.type === type)
      .map((m) => ({
        start: Math.max(0, Math.min(m.start, contentLength)),
        end: Math.max(0, Math.min(m.end, contentLength)),
      }))
      .filter((r) => r.end > r.start)
      .sort((a, b) => a.start - b.start);

    let current: { start: number; end: number } | null = null;
    for (const r of ranges) {
      if (!current) {
        current = { ...r };
        continue;
      }
      if (r.start <= current.end) {
        current.end = Math.max(current.end, r.end);
      } else {
        out.push({ type, ...current });
        current = { ...r };
      }
    }
    if (current) out.push({ type, ...current });
  }
  return out.sort(
    (a, b) => a.start - b.start || TAG_ORDER.indexOf(a.type) - TAG_ORDER.indexOf(b.type),
  );
}

/**
 * Toggle a mark type across [start, end). If the range is fully
 * covered by existing marks of that type, the marks are subtracted
 * from that range. Otherwise a new mark covering [start, end) is
 * added (and then normalized, which merges adjacent ranges).
 */
export function toggleMark(
  marks: Mark[],
  type: MarkType,
  start: number,
  end: number,
  contentLength: number,
): Mark[] {
  if (end <= start) return marks;
  const sameType = marks.filter((m) => m.type === type);
  const others = marks.filter((m) => m.type !== type);

  const covered = isRangeFullyCovered(sameType, start, end);
  if (covered) {
    const remaining = subtractRange(sameType, start, end);
    return normalizeMarks([...others, ...remaining], contentLength);
  }
  return normalizeMarks(
    [...others, ...sameType, { type, start, end }],
    contentLength,
  );
}

function isRangeFullyCovered(
  marks: { start: number; end: number }[],
  start: number,
  end: number,
): boolean {
  let cursor = start;
  const sorted = marks.slice().sort((a, b) => a.start - b.start);
  for (const m of sorted) {
    if (m.start > cursor) return false;
    if (m.end >= end) return true;
    cursor = Math.max(cursor, m.end);
  }
  return cursor >= end;
}

function subtractRange(
  marks: Mark[],
  start: number,
  end: number,
): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.end <= start || m.start >= end) {
      out.push(m);
      continue;
    }
    if (m.start < start) out.push({ ...m, end: start });
    if (m.end > end) out.push({ ...m, start: end });
  }
  return out;
}

/**
 * Serialize `content` + `marks` into contenteditable-safe HTML.
 *
 * Strategy: compute the active mark set at every character boundary,
 * walk left-to-right, and emit <b>/<i> tags when the set changes.
 * Bold always wraps italic for deterministic nesting — mismatched
 * boundaries are still correct, they just nest as <b>...<i>...</i>
 * ...</b> rather than alternating.
 */
export function marksToHtml(content: string, marks: Mark[] | undefined): string {
  const safe = marks ? normalizeMarks(marks, content.length) : [];
  if (safe.length === 0) return escapeHtml(content);

  // Build a list of boundaries (positions where any mark starts or ends).
  const boundarySet = new Set<number>([0, content.length]);
  for (const m of safe) {
    boundarySet.add(m.start);
    boundarySet.add(m.end);
  }
  const boundaries = [...boundarySet].sort((a, b) => a - b);

  let html = '';
  let activeBold = false;
  let activeItalic = false;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const bold = safe.some((m) => m.type === 'bold' && m.start <= from && m.end >= to);
    const italic = safe.some((m) => m.type === 'italic' && m.start <= from && m.end >= to);

    // Close in reverse order (italic first, then bold) before reopening.
    if (activeItalic && !italic) {
      html += '</i>';
      activeItalic = false;
    }
    if (activeBold && !bold) {
      html += '</b>';
      activeBold = false;
    }
    if (!activeBold && bold) {
      html += '<b>';
      activeBold = true;
    }
    if (!activeItalic && italic) {
      html += '<i>';
      activeItalic = true;
    }
    html += escapeHtml(content.slice(from, to));
  }
  if (activeItalic) html += '</i>';
  if (activeBold) html += '</b>';
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Walk the contenteditable DOM subtree and reconstruct
 * `{ content, marks }`. Recognizes <b>/<strong> as bold and
 * <i>/<em> as italic. <br> becomes "\n". Everything else is
 * treated as a container whose text content is collected.
 */
export function parseMarksFromDom(root: Node): { content: string; marks: Mark[] } {
  let content = '';
  const marks: Mark[] = [];
  const stack: { type: MarkType; start: number }[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      content += '\n';
      return;
    }

    let markType: MarkType | null = null;
    if (tag === 'b' || tag === 'strong') markType = 'bold';
    else if (tag === 'i' || tag === 'em') markType = 'italic';

    if (markType) {
      stack.push({ type: markType, start: content.length });
    }
    for (const child of Array.from(el.childNodes)) visit(child);
    if (markType) {
      const frame = stack.pop()!;
      if (content.length > frame.start) {
        marks.push({ type: frame.type, start: frame.start, end: content.length });
      }
    }
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  return { content, marks: normalizeMarks(marks, content.length) };
}
