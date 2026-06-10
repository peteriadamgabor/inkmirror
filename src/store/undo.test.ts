import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pushEntry,
  popUndo,
  popRedo,
  clearUndoStack,
  canUndo,
  canRedo,
  trackContentChange,
  finalizePendingBatch,
  markExternalBlockChange,
  externalSync,
  type ContentChangeEntry,
} from './undo';

function makeEntry(n: number, blockId = 'b1'): ContentChangeEntry {
  return {
    kind: 'content-change',
    blockId,
    before: { content: `before-${n}` },
    after: { content: `after-${n}` },
  };
}

beforeEach(() => {
  clearUndoStack();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('undo stack', () => {
  it('starts empty: popUndo is a safe no-op returning null', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    expect(popUndo()).toBeNull();
    // Still consistent after the no-op.
    expect(canUndo()).toBe(false);
  });

  it('pushEntry makes the entry undo-able and updates signals', () => {
    pushEntry(makeEntry(1));
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
  });

  it('popUndo returns entries LIFO', () => {
    pushEntry(makeEntry(1));
    pushEntry(makeEntry(2));
    expect(popUndo()).toEqual(makeEntry(2));
    expect(popUndo()).toEqual(makeEntry(1));
    expect(popUndo()).toBeNull();
  });

  it('popRedo re-surfaces the entry just undone', () => {
    pushEntry(makeEntry(1));
    const undone = popUndo();
    expect(canRedo()).toBe(true);
    expect(popRedo()).toEqual(undone);
    expect(canRedo()).toBe(false);
    expect(canUndo()).toBe(true);
  });

  it('popRedo on a stack with nothing undone returns null', () => {
    pushEntry(makeEntry(1));
    expect(popRedo()).toBeNull();
  });

  it('pushEntry after an undo discards the redo branch', () => {
    pushEntry(makeEntry(1));
    pushEntry(makeEntry(2));
    popUndo(); // entry 2 now in redo territory
    pushEntry(makeEntry(3)); // diverge — entry 2 must be dropped
    expect(canRedo()).toBe(false);
    expect(popUndo()).toEqual(makeEntry(3));
    expect(popUndo()).toEqual(makeEntry(1));
  });

  it('caps the stack at 50 entries, evicting the oldest', () => {
    for (let i = 1; i <= 55; i++) pushEntry(makeEntry(i));
    let count = 0;
    let last: ContentChangeEntry | null = null;
    for (;;) {
      const e = popUndo() as ContentChangeEntry | null;
      if (!e) break;
      last = e;
      count++;
    }
    expect(count).toBe(50);
    // Newest survives, oldest five were evicted.
    expect(last?.before.content).toBe('before-6');
  });

  it('clearUndoStack empties everything', () => {
    pushEntry(makeEntry(1));
    pushEntry(makeEntry(2));
    popUndo();
    clearUndoStack();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    expect(popUndo()).toBeNull();
    expect(popRedo()).toBeNull();
  });
});

describe('content-change batching', () => {
  it('batches successive keystrokes into one entry: first before + final after', () => {
    trackContentChange('b1', 'v0', undefined);
    trackContentChange('b1', 'v1', undefined); // extends the batch — before stays v0
    finalizePendingBatch('b1', 'v2');
    const entry = popUndo() as ContentChangeEntry | null;
    expect(entry).toEqual({
      kind: 'content-change',
      blockId: 'b1',
      before: { content: 'v0', marks: undefined },
      after: { content: 'v2', marks: undefined },
    });
    expect(popUndo()).toBeNull(); // exactly one entry for the whole batch
  });

  it('does not push when the content did not actually change', () => {
    trackContentChange('b1', 'same', undefined);
    finalizePendingBatch('b1', 'same');
    expect(canUndo()).toBe(false);
  });

  it('finalizePendingBatch scoped to another block leaves the batch pending', () => {
    trackContentChange('b1', 'v0', undefined);
    finalizePendingBatch('b2', 'irrelevant');
    expect(canUndo()).toBe(false); // b1's batch is still open
    finalizePendingBatch('b1', 'v1');
    expect(canUndo()).toBe(true);
  });

  it('switching blocks auto-finalizes the previous batch with its before-state (no entry)', () => {
    // Documents current behavior: trackContentChange(other block) finalizes
    // the prior batch WITHOUT an after-state, so `after` defaults to
    // `before` and the entry is skipped as a no-change. The previous
    // block's typing is only undoable if a commit point (blur, structural
    // mutation) called finalizePendingBatch with the live content first.
    // Suspected gap, kept as-is — see undo.ts trackContentChange().
    trackContentChange('b1', 'a-before', undefined);
    trackContentChange('b2', 'b-before', undefined);
    expect(canUndo()).toBe(false); // b1's batch was dropped, not pushed
    finalizePendingBatch('b2', 'b-after');
    const entry = popUndo() as ContentChangeEntry | null;
    expect(entry?.blockId).toBe('b2');
    expect(popUndo()).toBeNull(); // nothing was ever pushed for b1
  });

  it('the 2s batch timer silently drops the batch without pushing an entry', () => {
    // Documents current behavior: flushContentBatch only nulls the pending
    // batch; it never pushes. Keystrokes followed by a >2s pause are not
    // undoable unless a caller finalizes first (performUndo does this for
    // the focused block). Kept as-is.
    vi.useFakeTimers();
    trackContentChange('b1', 'before-pause', undefined);
    vi.advanceTimersByTime(2001);
    finalizePendingBatch('b1', 'after-pause'); // batch already flushed → no-op
    expect(canUndo()).toBe(false);
  });
});

describe('external DOM-sync pulse', () => {
  it('markExternalBlockChange publishes the blockId with a monotonically increasing rev', () => {
    markExternalBlockChange('b1');
    const first = externalSync();
    expect(first?.blockId).toBe('b1');
    markExternalBlockChange('b2');
    const second = externalSync();
    expect(second?.blockId).toBe('b2');
    expect(second!.rev).toBeGreaterThan(first!.rev);
  });
});
