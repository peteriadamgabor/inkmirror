import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCaretOffset,
  getContentCaretOffset,
  getSelectionOffsets,
  getTextLength,
} from './block-caret';
import { parseMarksFromDom } from '@/engine/marks';
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

describe('content-ruler offsets (paste splitting, mark ranges)', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  function selectRange(
    startNode: Node, startOffset: number,
    endNode: Node, endOffset: number,
  ): void {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('getContentCaretOffset counts a soft break, getCaretOffset does not', () => {
    el.innerHTML = 'ab<br>cd';
    placeCaret(el.lastChild!, 1); // between 'c' and 'd'
    // Committed content is 'ab\ncd' — 'd' sits at index 4.
    expect(parseMarksFromDom(el).content).toBe('ab\ncd');
    expect(getContentCaretOffset(el)).toBe(4);
    // The visual-end ruler ignores the break by design.
    expect(getCaretOffset(el)).toBe(3);
  });

  it('paste split offset slices the committed content at the right spot', () => {
    el.innerHTML = 'head<br>TAIL';
    placeCaret(el.lastChild!, 0); // caret right before 'TAIL'
    const { content } = parseMarksFromDom(el);
    const caret = getContentCaretOffset(el);
    expect(content.slice(0, caret)).toBe('head\n');
    expect(content.slice(caret)).toBe('TAIL');
  });

  it('getSelectionOffsets indexes into committed content across a <br>', () => {
    el.innerHTML = 'ab<br>cd';
    selectRange(el.lastChild!, 0, el.lastChild!, 2); // select 'cd'
    const offsets = getSelectionOffsets(el)!;
    expect(offsets).toEqual({ start: 3, end: 5 });
    // A mark stored with these offsets covers exactly the selected text.
    expect(parseMarksFromDom(el).content.slice(offsets.start, offsets.end)).toBe('cd');
  });

  it('getSelectionOffsets stays correct without any soft break', () => {
    el.textContent = 'hello world';
    selectRange(el.firstChild!, 6, el.firstChild!, 11); // 'world'
    expect(getSelectionOffsets(el)).toEqual({ start: 6, end: 11 });
  });
});
