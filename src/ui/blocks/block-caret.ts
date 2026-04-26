/**
 * Pure DOM helpers for caret + selection management inside a
 * contenteditable block. No Solid imports — these are framework-free
 * utilities used by BlockView and the editor hooks.
 */

export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/**
 * Restore a non-collapsed selection by walking text nodes until the
 * cumulative character count reaches `start` and `end`. Used after
 * mark-toggle re-renders the block's innerHTML.
 */
export function restoreSelectionRange(el: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = start;
  let startSet = false;
  let endRemaining = end;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (!startSet && remaining <= len) {
        range.setStart(node, remaining);
        startSet = true;
      } else if (!startSet) {
        remaining -= len;
      }
      if (startSet && endRemaining <= len) {
        range.setEnd(node, endRemaining);
        return true;
      }
      endRemaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        return true;
      }
      remaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function isCaretAtFirstLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '30');
  return caretRect.top - elRect.top < lineHeight;
}

export function isCaretAtLastLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '30');
  return elRect.bottom - caretRect.bottom < lineHeight;
}

export function focusBlock(blockId: string, caretPosition: 'start' | 'end' | number = 'start'): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"] [data-editable]`,
    );
    if (!el) return;
    el.focus();
    const offset =
      caretPosition === 'start' ? 0 :
      caretPosition === 'end' ? (el.innerText?.length ?? 0) :
      caretPosition;
    setCaretOffset(el, offset);
  });
}

/** Get the current selection's character offsets relative to `el`'s
 *  plain-text content. Returns null if the selection isn't inside this
 *  block or is collapsed (caret only, no range to mark). */
export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
    return null;
  }
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}
