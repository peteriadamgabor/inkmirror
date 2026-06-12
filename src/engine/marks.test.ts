import { describe, it, expect } from 'vitest';
import { domPointToContentOffset, marksToHtml, normalizeMarks, parseMarksFromDom, toggleMark } from './marks';
import type { Mark } from '@/types/block';

describe('normalizeMarks', () => {
  it('sorts by start offset', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 5, end: 10 },
      { type: 'bold', start: 0, end: 3 },
    ];
    expect(normalizeMarks(marks, 100)).toEqual([
      { type: 'bold', start: 0, end: 3 },
      { type: 'bold', start: 5, end: 10 },
    ]);
  });

  it('merges overlapping same-type marks', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 5 },
      { type: 'bold', start: 3, end: 8 },
    ];
    expect(normalizeMarks(marks, 100)).toEqual([
      { type: 'bold', start: 0, end: 8 },
    ]);
  });

  it('merges touching same-type marks', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 5 },
      { type: 'bold', start: 5, end: 8 },
    ];
    expect(normalizeMarks(marks, 100)).toEqual([
      { type: 'bold', start: 0, end: 8 },
    ]);
  });

  it('clips marks to content length', () => {
    const marks: Mark[] = [{ type: 'bold', start: 0, end: 100 }];
    expect(normalizeMarks(marks, 5)).toEqual([
      { type: 'bold', start: 0, end: 5 },
    ]);
  });

  it('drops empty marks', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 5, end: 5 },
      { type: 'italic', start: 3, end: 2 },
    ];
    expect(normalizeMarks(marks, 100)).toEqual([]);
  });

  it('keeps bold and italic separate', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 10 },
      { type: 'italic', start: 0, end: 10 },
    ];
    expect(normalizeMarks(marks, 100)).toHaveLength(2);
  });
});

describe('toggleMark', () => {
  it('adds a mark when none exists', () => {
    const result = toggleMark([], 'bold', 0, 5, 10);
    expect(result).toEqual([{ type: 'bold', start: 0, end: 5 }]);
  });

  it('removes a mark when fully covered', () => {
    const marks: Mark[] = [{ type: 'bold', start: 0, end: 10 }];
    expect(toggleMark(marks, 'bold', 0, 10, 10)).toEqual([]);
  });

  it('splits a mark when the range is a subset', () => {
    const marks: Mark[] = [{ type: 'bold', start: 0, end: 10 }];
    const result = toggleMark(marks, 'bold', 3, 6, 10);
    expect(result).toEqual([
      { type: 'bold', start: 0, end: 3 },
      { type: 'bold', start: 6, end: 10 },
    ]);
  });

  it('extends when the range is partially covered', () => {
    const marks: Mark[] = [{ type: 'bold', start: 0, end: 5 }];
    const result = toggleMark(marks, 'bold', 3, 10, 10);
    expect(result).toEqual([{ type: 'bold', start: 0, end: 10 }]);
  });

  it('does not touch marks of a different type', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 5 },
      { type: 'italic', start: 0, end: 5 },
    ];
    const result = toggleMark(marks, 'bold', 0, 5, 5);
    expect(result).toEqual([{ type: 'italic', start: 0, end: 5 }]);
  });
});

describe('marksToHtml', () => {
  it('escapes HTML in plain text', () => {
    expect(marksToHtml('a < b & c > d', undefined)).toBe('a &lt; b &amp; c &gt; d');
  });

  it('wraps a single bold range', () => {
    const marks: Mark[] = [{ type: 'bold', start: 6, end: 11 }];
    expect(marksToHtml('Hello world', marks)).toBe('Hello <b>world</b>');
  });

  it('wraps a single italic range', () => {
    const marks: Mark[] = [{ type: 'italic', start: 0, end: 5 }];
    expect(marksToHtml('Hello world', marks)).toBe('<i>Hello</i> world');
  });

  it('nests italic inside bold', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 11 },
      { type: 'italic', start: 6, end: 11 },
    ];
    expect(marksToHtml('Hello world', marks)).toBe('<b>Hello <i>world</i></b>');
  });

  it('handles partial overlap by closing and reopening', () => {
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 8 },
      { type: 'italic', start: 4, end: 11 },
    ];
    const html = marksToHtml('Hello world', marks);
    // Plain text content is preserved regardless of nesting.
    expect(html.replace(/<\/?[bi]>/g, '')).toBe('Hello world');
  });
});

describe('parseMarksFromDom', () => {
  function makeRoot(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  }

  it('reads plain text', () => {
    const { content, marks } = parseMarksFromDom(makeRoot('Hello world'));
    expect(content).toBe('Hello world');
    expect(marks).toEqual([]);
  });

  it('reads a bold span', () => {
    const { content, marks } = parseMarksFromDom(makeRoot('Hello <b>world</b>'));
    expect(content).toBe('Hello world');
    expect(marks).toEqual([{ type: 'bold', start: 6, end: 11 }]);
  });

  it('reads nested bold and italic', () => {
    const { content, marks } = parseMarksFromDom(
      makeRoot('<b>Hello <i>world</i></b>'),
    );
    expect(content).toBe('Hello world');
    expect(marks).toContainEqual({ type: 'bold', start: 0, end: 11 });
    expect(marks).toContainEqual({ type: 'italic', start: 6, end: 11 });
  });

  it('recognizes <strong> as bold and <em> as italic', () => {
    const { marks } = parseMarksFromDom(
      makeRoot('<strong>a</strong><em>b</em>'),
    );
    expect(marks).toContainEqual({ type: 'bold', start: 0, end: 1 });
    expect(marks).toContainEqual({ type: 'italic', start: 1, end: 2 });
  });

  it('treats <br> as a newline', () => {
    const { content } = parseMarksFromDom(makeRoot('first<br>second'));
    expect(content).toBe('first\nsecond');
  });

  it('treats sibling <div> blocks as newlines (Firefox mid-Enter)', () => {
    // Firefox's contenteditable wraps each line in its own <div> when the
    // user presses Enter mid-content. Without paragraph-break detection,
    // the line break is silently flattened on commit and lost on reload.
    const { content } = parseMarksFromDom(makeRoot('<div>Quote</div><div> line one</div>'));
    expect(content).toBe('Quote\n line one');
  });

  it('treats text + <div> as a newline (Chromium mid-Enter)', () => {
    // Chromium's mid-Enter leaves the leading text loose and wraps the
    // tail in a <div>: "First<div>XX line</div>".
    const { content } = parseMarksFromDom(makeRoot('First<div>XX line</div>'));
    expect(content).toBe('First\nXX line');
  });

  it('treats <p> blocks as newlines', () => {
    const { content } = parseMarksFromDom(makeRoot('<p>one</p><p>two</p>'));
    expect(content).toBe('one\ntwo');
  });

  it('does not double newlines when a <div> already follows a <br>', () => {
    const { content } = parseMarksFromDom(makeRoot('a<br><div>b</div>'));
    expect(content).toBe('a\nb');
  });

  it('preserves marks across <div> paragraph breaks', () => {
    const { content, marks } = parseMarksFromDom(
      makeRoot('<div><b>bold</b></div><div>plain</div>'),
    );
    expect(content).toBe('bold\nplain');
    expect(marks).toEqual([{ type: 'bold', start: 0, end: 4 }]);
  });
});

describe('roundtrip: marks → html → marks', () => {
  it('preserves the mark set', () => {
    const content = 'Alice whispered something.';
    const marks: Mark[] = [
      { type: 'bold', start: 0, end: 5 },
      { type: 'italic', start: 6, end: 15 },
    ];
    const html = marksToHtml(content, marks);
    const root = document.createElement('div');
    root.innerHTML = html;
    const parsed = parseMarksFromDom(root);
    expect(parsed.content).toBe(content);
    expect(parsed.marks).toEqual(normalizeMarks(marks, content.length));
  });

  it('preserves newlines from Shift+Enter round-trips through marks→html→marks', () => {
    // Shift+Enter in contenteditable inserts a <br>; parseMarksFromDom
    // converts that to a \n. Re-rendering through marksToHtml must
    // preserve the \n so CSS white-space: pre-wrap renders the visual
    // line break on the next paint.
    const content = 'Line one\nLine two';
    const html = marksToHtml(content, []);
    expect(html).toBe('Line one\nLine two');

    // And after the browser parses that HTML string into a contenteditable,
    // reading it back via parseMarksFromDom still gives us '\n'.
    const root = document.createElement('div');
    root.style.whiteSpace = 'pre-wrap';
    root.innerHTML = html;
    const parsed = parseMarksFromDom(root);
    expect(parsed.content).toBe('Line one\nLine two');
  });

  it('preserves newlines alongside inline marks', () => {
    const content = 'First\nBold tail';
    const marks: Mark[] = [{ type: 'bold', start: 6, end: 15 }];
    const html = marksToHtml(content, marks);
    // The \n survives between the escaped text and the <b> wrapper.
    expect(html).toBe('First\n<b>Bold tail</b>');
  });
});

describe('domPointToContentOffset', () => {
  // Every expectation cross-checks against parseMarksFromDom(root).content —
  // the two walks must stay in lockstep, that's the whole contract.
  function makeRoot(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  }

  it('plain text node maps 1:1', () => {
    const root = makeRoot('hello');
    expect(parseMarksFromDom(root).content).toBe('hello');
    expect(domPointToContentOffset(root, root.firstChild!, 3)).toBe(3);
  });

  it('counts a <br> before the point as one character', () => {
    const root = makeRoot('ab<br>cd');
    expect(parseMarksFromDom(root).content).toBe('ab\ncd');
    // Point at 'd' (offset 1 inside the 'cd' text node) → index 4.
    expect(domPointToContentOffset(root, root.lastChild!, 1)).toBe(4);
  });

  it('point anchored on the <br> element itself maps to just before it', () => {
    const root = makeRoot('ab<br>cd');
    const br = root.childNodes[1];
    expect(domPointToContentOffset(root, br, 0)).toBe(2);
  });

  it('element-anchored point (root + child index) lands between children', () => {
    const root = makeRoot('ab<br>cd');
    expect(domPointToContentOffset(root, root, 0)).toBe(0);
    expect(domPointToContentOffset(root, root, 2)).toBe(3); // after the br
    expect(domPointToContentOffset(root, root, 3)).toBe(5); // end
  });

  it('walks into inline mark wrappers', () => {
    const root = makeRoot('a<b>bc</b><br>d');
    expect(parseMarksFromDom(root).content).toBe('abc\nd');
    const boldText = root.childNodes[1].firstChild!;
    expect(domPointToContentOffset(root, boldText, 1)).toBe(2);
    expect(domPointToContentOffset(root, root.lastChild!, 1)).toBe(5);
  });

  it('counts Chrome-style <div> line wrappers as one break', () => {
    const root = makeRoot('ab<div>cd</div>');
    expect(parseMarksFromDom(root).content).toBe('ab\ncd');
    const divText = root.lastChild!.firstChild!;
    expect(domPointToContentOffset(root, divText, 0)).toBe(3);
    expect(domPointToContentOffset(root, divText, 2)).toBe(5);
  });

  it('literal newline text nodes need no adjustment', () => {
    const root = makeRoot('');
    root.textContent = 'ab\ncd';
    expect(domPointToContentOffset(root, root.firstChild!, 4)).toBe(4);
  });

  it('clamps a text offset past the node end', () => {
    const root = makeRoot('ab');
    expect(domPointToContentOffset(root, root.firstChild!, 99)).toBe(2);
  });
});
