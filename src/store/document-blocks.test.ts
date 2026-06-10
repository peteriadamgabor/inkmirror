import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import {
  store,
  loadSyntheticDoc,
  setPersistEnabled,
  updateBlockContent,
  createBlockAfter,
  createBlockBefore,
  updateBlockType,
  moveBlockToPosition,
  duplicateBlock,
  insertPastedParagraphs,
  deleteBlock,
  performUndo,
  performRedo,
} from './document';
import { clearUndoStack, canUndo, finalizePendingBatch } from './undo';
import * as repo from '@/db/repository';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document } from '@/types';

const FIXTURE_TS = '2026-04-12T00:00:00.000Z';

function makeBlock(id: string, chapterId: string, order: number, content: string): Block {
  return {
    id,
    chapter_id: chapterId,
    type: 'text',
    content,
    order,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: FIXTURE_TS,
    updated_at: FIXTURE_TS,
  };
}

function makeDoc(): SyntheticDoc {
  const chapter: Chapter = {
    id: 'ch1',
    document_id: 'd1',
    title: 'Chapter 1',
    order: 0,
    kind: 'standard',
    created_at: FIXTURE_TS,
    updated_at: FIXTURE_TS,
  };
  const document: Document = {
    id: 'd1',
    title: 'Test',
    author: 'Test',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: FIXTURE_TS,
    updated_at: FIXTURE_TS,
  };
  return {
    document,
    chapters: [chapter],
    blocks: [
      makeBlock('b1', 'ch1', 0, 'first'),
      makeBlock('b2', 'ch1', 1, 'second'),
      makeBlock('b3', 'ch1', 2, 'third'),
    ],
  };
}

describe('document-blocks store mutations', () => {
  beforeAll(() => setPersistEnabled(false));
  afterAll(() => setPersistEnabled(true));

  beforeEach(() => {
    loadSyntheticDoc(makeDoc());
    clearUndoStack();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('block creation', () => {
    it('createBlockAfter inserts a block right after the anchor with the same chapter_id', () => {
      const newId = createBlockAfter('b1', 'text');
      expect(store.blocks[newId]).toBeDefined();
      expect(store.blocks[newId].chapter_id).toBe('ch1');
      expect(store.blocks[newId].content).toBe('');
      expect(store.blocks[newId].deleted_at).toBeNull();
      expect(store.blockOrder).toEqual(['b1', newId, 'b2', 'b3']);
    });

    it('createBlockAfter honors the requested block type with its default metadata', () => {
      const newId = createBlockAfter('b2', 'dialogue');
      expect(store.blocks[newId].type).toBe('dialogue');
      expect(store.blocks[newId].metadata).toEqual({
        type: 'dialogue',
        data: { speaker_id: '' },
      });
    });

    it('createBlockBefore inserts a block right before the anchor', () => {
      const newId = createBlockBefore('b2');
      expect(store.blocks[newId].chapter_id).toBe('ch1');
      expect(store.blockOrder).toEqual(['b1', newId, 'b2', 'b3']);
    });
  });

  describe('updateBlockContent', () => {
    it('updates content granularly and bumps updated_at', () => {
      updateBlockContent('b2', 'SECOND, revised');
      expect(store.blocks['b2'].content).toBe('SECOND, revised');
      expect(store.blocks['b2'].updated_at).not.toBe(FIXTURE_TS);
      expect(store.blocks['b2'].updated_at > FIXTURE_TS).toBe(true);
      // Neighbors untouched.
      expect(store.blocks['b1'].content).toBe('first');
      expect(store.blocks['b1'].updated_at).toBe(FIXTURE_TS);
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });
  });

  describe('updateBlockType (type conversion)', () => {
    it('text → dialogue preserves content and swaps the metadata discriminant', () => {
      updateBlockType('b1', 'dialogue');
      expect(store.blocks['b1'].type).toBe('dialogue');
      expect(store.blocks['b1'].content).toBe('first');
      expect(store.blocks['b1'].metadata).toEqual({
        type: 'dialogue',
        data: { speaker_id: '' },
      });
      expect(store.blocks['b1'].updated_at > FIXTURE_TS).toBe(true);
    });

    it('text → scene installs the scene metadata defaults', () => {
      updateBlockType('b3', 'scene');
      expect(store.blocks['b3'].metadata).toEqual({
        type: 'scene',
        data: { location: '', time: '', character_ids: [], mood: '' },
      });
      expect(store.blocks['b3'].content).toBe('third');
    });

    it('is a no-op when converting to the same type', () => {
      updateBlockType('b1', 'text');
      expect(store.blocks['b1'].updated_at).toBe(FIXTURE_TS);
      expect(canUndo()).toBe(false);
    });

    it('pushes an undo entry — performUndo restores the original type and metadata', () => {
      updateBlockType('b1', 'dialogue');
      expect(canUndo()).toBe(true);
      const undone = performUndo();
      expect(undone).toBe(true);
      expect(store.blocks['b1'].type).toBe('text');
      expect(store.blocks['b1'].metadata).toEqual({ type: 'text' });
      // Redo re-applies the conversion.
      expect(performRedo()).toBe(true);
      expect(store.blocks['b1'].type).toBe('dialogue');
    });
  });

  describe('moveBlockToPosition', () => {
    it('moves a block to the target index and rewrites order fields', () => {
      const ok = moveBlockToPosition('b1', 3);
      expect(ok).toBe(true);
      expect(store.blockOrder).toEqual(['b2', 'b3', 'b1']);
      expect(store.blocks['b2'].order).toBe(0);
      expect(store.blocks['b3'].order).toBe(1);
      expect(store.blocks['b1'].order).toBe(2);
    });

    it('moves a later block up to the front', () => {
      const ok = moveBlockToPosition('b3', 0);
      expect(ok).toBe(true);
      expect(store.blockOrder).toEqual(['b3', 'b1', 'b2']);
    });

    it('rejects no-op targets (same slot or directly after itself)', () => {
      expect(moveBlockToPosition('b2', 1)).toBe(false);
      expect(moveBlockToPosition('b2', 2)).toBe(false);
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });

    it('returns false for unknown block ids', () => {
      expect(moveBlockToPosition('nope', 0)).toBe(false);
    });
  });

  describe('deleteBlock (soft delete)', () => {
    it('sets deleted_at AND deleted_from, removes from blockOrder, keeps the row in store.blocks', () => {
      deleteBlock('b2');
      expect(store.blockOrder).toEqual(['b1', 'b3']);
      // Never hard-deleted: the row survives, flagged.
      expect(store.blocks['b2']).toBeDefined();
      expect(store.blocks['b2'].deleted_at).toEqual(expect.any(String));
      expect(store.blocks['b2'].deleted_from).toEqual({
        chapter_id: 'ch1',
        chapter_title: 'Chapter 1',
        position: 1,
      });
    });

    it('persists the soft-delete via saveBlock (full row write), never a hard delete', () => {
      const saveSpy = vi.spyOn(repo, 'saveBlock').mockResolvedValue();
      setPersistEnabled(true);
      try {
        deleteBlock('b2');
      } finally {
        setPersistEnabled(false);
      }
      // The only persistence call is saveBlock carrying the soft-delete
      // fields — there is no hard-delete repo call on this path.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'b2',
          deleted_at: expect.any(String),
          deleted_from: expect.objectContaining({ chapter_id: 'ch1', position: 1 }),
        }),
        'd1',
      );
    });

    it('performUndo restores a deleted block at its original position', () => {
      deleteBlock('b2');
      expect(performUndo()).toBe(true);
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
      expect(store.blocks['b2'].deleted_at).toBeNull();
      expect(store.blocks['b2'].deleted_from).toBeNull();
    });
  });

  describe('duplicateBlock', () => {
    it('creates a sibling right after the source with identical type/content/metadata', () => {
      updateBlockType('b1', 'dialogue');
      const newId = duplicateBlock('b1');
      expect(newId).not.toBeNull();
      expect(store.blockOrder).toEqual(['b1', newId, 'b2', 'b3']);
      expect(store.blocks[newId!].type).toBe('dialogue');
      expect(store.blocks[newId!].content).toBe('first');
      expect(store.blocks[newId!].metadata).toEqual(store.blocks['b1'].metadata);
    });

    it('returns null for unknown block ids', () => {
      expect(duplicateBlock('nope')).toBeNull();
    });
  });

  describe('insertPastedParagraphs', () => {
    it('splits multi-paragraph paste into one block per paragraph', () => {
      // Caret at the end of 'first' (offset 5).
      const result = insertPastedParagraphs('b1', 5, 'AAA\n\nBBB\n\nCCC');
      expect(store.blocks['b1'].content).toBe('firstAAA');
      const [, midId, lastId] = store.blockOrder;
      expect(store.blocks[midId].content).toBe('BBB');
      expect(store.blocks[lastId].content).toBe('CCC');
      expect(result.targetBlockId).toBe(lastId);
      expect(result.caretOffset).toBe(3);
      expect(store.blockOrder.slice(3)).toEqual(['b2', 'b3']);
    });

    it('falls back to the caller for single-paragraph text', () => {
      const result = insertPastedParagraphs('b1', 2, 'no paragraph breaks here');
      expect(result).toEqual({ targetBlockId: 'b1', caretOffset: 2 });
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
      expect(store.blocks['b1'].content).toBe('first');
    });
  });

  describe('undo integration for content commits', () => {
    it('a committed content batch lands on the undo stack; undo/redo round-trips it', () => {
      updateBlockContent('b1', 'first rewritten');
      // Simulate the blur/structural commit point that closes the batch.
      finalizePendingBatch('b1', store.blocks['b1'].content, store.blocks['b1'].marks);
      expect(canUndo()).toBe(true);

      expect(performUndo()).toBe(true);
      expect(store.blocks['b1'].content).toBe('first');

      expect(performRedo()).toBe(true);
      expect(store.blocks['b1'].content).toBe('first rewritten');
    });
  });
});
