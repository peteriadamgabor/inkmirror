import { describe, it, expect } from 'vitest';
import { diffWords, countSegments } from './word-diff';

describe('diffWords', () => {
  it('returns a single equal segment for identical inputs', () => {
    const segs = diffWords('hello world', 'hello world');
    expect(segs).toEqual([{ kind: 'equal', text: 'hello world' }]);
  });

  it('detects pure addition at end', () => {
    const segs = diffWords('hello', 'hello world');
    expect(segs.filter((s) => s.kind === 'add').map((s) => s.text).join('')).toBe(' world');
  });

  it('detects pure removal at end', () => {
    const segs = diffWords('hello world', 'hello');
    expect(segs.filter((s) => s.kind === 'remove').map((s) => s.text).join('')).toBe(' world');
  });

  it('detects mid-sentence rewrite', () => {
    const segs = diffWords('the dark night', 'the cold dawn');
    const removed = segs.filter((s) => s.kind === 'remove').map((s) => s.text);
    const added = segs.filter((s) => s.kind === 'add').map((s) => s.text);
    expect(removed.join('').trim()).toContain('dark');
    expect(removed.join('').trim()).toContain('night');
    expect(added.join('').trim()).toContain('cold');
    expect(added.join('').trim()).toContain('dawn');
  });

  it('treats newline as a token', () => {
    const segs = diffWords('a b', 'a\nb');
    const hasNewlineAdd = segs.some((s) => s.kind === 'add' && s.text.includes('\n'));
    const hasSpaceRemove = segs.some((s) => s.kind === 'remove' && s.text === ' ');
    expect(hasNewlineAdd || hasSpaceRemove).toBe(true);
  });

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'hi')).toEqual([{ kind: 'add', text: 'hi' }]);
    expect(diffWords('hi', '')).toEqual([{ kind: 'remove', text: 'hi' }]);
  });

  it('reapplying the diff to prev recovers next', () => {
    const prev = 'The quick brown fox jumps over the lazy dog';
    const next = 'The slow brown fox stumbles over the lazy turtle';
    const segs = diffWords(prev, next);
    const reconstructed = segs
      .filter((s) => s.kind !== 'remove')
      .map((s) => s.text)
      .join('');
    expect(reconstructed).toBe(next);
  });
});

describe('countSegments', () => {
  it('counts non-equal segments', () => {
    const segs = diffWords('the dark night', 'the cold dawn');
    expect(countSegments(segs)).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 for identical inputs', () => {
    const segs = diffWords('same', 'same');
    expect(countSegments(segs)).toBe(0);
  });
});
