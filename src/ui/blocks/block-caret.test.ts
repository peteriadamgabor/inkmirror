import { describe, expect, it, beforeEach } from 'vitest';
import { getCaretOffset, getTextLength } from './block-caret';
import { resolveKeyIntent, type KeyContext } from './keybindings';

/**
 * Regression tests for the "Enter inserts a newline instead of starting a
 * new block" bug. The end-of-block check in keybindings compares
 * caretOffset (Range.toString — ignores <br>) against contentLength,
 * which used to come from el.innerText (counts <br> as "\n"). Once the
 * browser inserted a <br> — Firefox does on mid-content Enter, and leaves
 * a padding <br> behind on deletions — the two could never be equal and
 * Enter fell through to the browser default forever. Both numbers must
 * come from the same ruler: getTextLength.
 */

function placeCaret(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function enterContext(el: HTMLElement): KeyContext {
  return {
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    caretOffset: getCaretOffset(el),
    contentLength: getTextLength(el),
    atFirstLine: false,
    atLastLine: true,
  };
}

describe('getTextLength / getCaretOffset consistency', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('plain text: caret at end equals text length', () => {
    el.textContent = 'Hello';
    placeCaret(el.firstChild!, 5);
    expect(getTextLength(el)).toBe(5);
    expect(getCaretOffset(el)).toBe(5);
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
  });

  it('soft line break (<br>): Enter at the very end still creates a block', () => {
    el.innerHTML = 'line1<br>line2';
    const line2 = el.lastChild!;
    placeCaret(line2, 5);
    expect(getCaretOffset(el)).toBe(getTextLength(el));
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
  });

  it('soft line break (<br>): Enter mid-content still falls through to a newline', () => {
    el.innerHTML = 'line1<br>line2';
    placeCaret(el.firstChild!, 5); // end of line1, but line2 follows
    expect(getCaretOffset(el)).toBeLessThan(getTextLength(el));
    expect(resolveKeyIntent({ ...enterContext(el), atLastLine: false })).toBeNull();
  });

  it('trailing padding <br>: caret after the text counts as end-of-block', () => {
    el.innerHTML = 'foo<br>';
    placeCaret(el.firstChild!, 3);
    expect(getCaretOffset(el)).toBe(getTextLength(el));
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
  });

  it('empty block with placeholder <br>: still counts as empty', () => {
    el.innerHTML = '<br>';
    placeCaret(el, 0);
    expect(getTextLength(el)).toBe(0);
    expect(getCaretOffset(el)).toBe(0);
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
    expect(
      resolveKeyIntent({ ...enterContext(el), key: 'Backspace' }),
    ).toEqual({ type: 'delete-empty-block' });
  });

  it('literal \\n in a text node (re-rendered store content) stays consistent', () => {
    el.textContent = 'line1\nline2';
    placeCaret(el.firstChild!, 11);
    expect(getTextLength(el)).toBe(11);
    expect(getCaretOffset(el)).toBe(11);
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
  });

  it('Chrome-style <div> line wrapper: end of last line counts as end-of-block', () => {
    el.innerHTML = 'line1<div>line2</div>';
    const line2 = el.lastChild!.firstChild!;
    placeCaret(line2, 5);
    expect(getCaretOffset(el)).toBe(getTextLength(el));
    expect(resolveKeyIntent(enterContext(el))).toEqual({ type: 'create-block-after' });
  });
});
