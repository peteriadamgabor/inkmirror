import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import {
  store,
  loadSyntheticDoc,
  updateBlockContent,
  createBlockAfter,
  mergeBlockWithPrevious,
  deleteBlock,
  setPersistEnabled,
  createChapter,
  renameChapter,
  setActiveChapter,
  moveBlock,
} from './document';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document } from '@/types';

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
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
}

function makeDoc(): SyntheticDoc {
  const chapter: Chapter = {
    id: 'ch1',
    document_id: 'd1',
    title: 'Chapter 1',
    order: 0,
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
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
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
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

describe('document store mutations', () => {
  beforeAll(() => setPersistEnabled(false));
  afterAll(() => setPersistEnabled(true));

  beforeEach(() => {
    loadSyntheticDoc(makeDoc());
  });

  describe('updateBlockContent', () => {
    it('updates content and leaves ordering intact', () => {
      updateBlockContent('b2', 'SECOND');
      expect(store.blocks['b2'].content).toBe('SECOND');
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });

    it('is a no-op for unknown ids', () => {
      updateBlockContent('nope', 'nope');
      expect(store.blocks['nope']).toBeUndefined();
    });
  });

  describe('createBlockAfter', () => {
    it('inserts a new empty text block after the given id', () => {
      const newId = createBlockAfter('b1');
      expect(store.blockOrder).toEqual(['b1', newId, 'b2', 'b3']);
      expect(store.blocks[newId].content).toBe('');
      expect(store.blocks[newId].type).toBe('text');
      expect(store.blocks[newId].chapter_id).toBe('ch1');
    });

    it('returns a non-empty id string', () => {
      const newId = createBlockAfter('b3');
      expect(typeof newId).toBe('string');
      expect(newId.length).toBeGreaterThan(0);
      expect(store.blockOrder[store.blockOrder.length - 1]).toBe(newId);
    });
  });

  describe('mergeBlockWithPrevious', () => {
    it('concatenates content with the previous block and soft-deletes the merged block', () => {
      mergeBlockWithPrevious('b2');
      expect(store.blocks['b1'].content).toBe('firstsecond');
      expect(store.blockOrder).toEqual(['b1', 'b3']);
      // b2 row still exists but is flagged
      expect(store.blocks['b2']).toBeDefined();
      expect(store.blocks['b2'].deleted_at).toBeTruthy();
    });

    it('returns the previous block id and the cursor offset', () => {
      const result = mergeBlockWithPrevious('b2');
      expect(result).toEqual({ previousId: 'b1', cursorOffset: 5 });
    });

    it('is a no-op at the first block', () => {
      const result = mergeBlockWithPrevious('b1');
      expect(result).toBeNull();
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });
  });

  describe('createChapter', () => {
    it('appends a chapter, creates one empty block inside it, and sets it active', () => {
      const result = createChapter();
      expect(result).not.toBeNull();
      const { chapterId, blockId } = result!;
      expect(store.chapters).toHaveLength(2);
      const ch = store.chapters.find((c) => c.id === chapterId);
      expect(ch?.title).toBe('Chapter 2');
      expect(ch?.order).toBe(1);
      expect(store.blocks[blockId]).toBeDefined();
      expect(store.blocks[blockId].chapter_id).toBe(chapterId);
      expect(store.blocks[blockId].content).toBe('');
      expect(store.blockOrder).toContain(blockId);
      expect(store.activeChapterId).toBe(chapterId);
    });

    it('auto-numbers based on existing chapter count', () => {
      createChapter();
      createChapter();
      const titles = store.chapters.map((c) => c.title);
      expect(titles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    });
  });

  describe('renameChapter', () => {
    it('updates the title in place', () => {
      renameChapter('ch1', 'Opening');
      expect(store.chapters[0].title).toBe('Opening');
    });

    it('trims whitespace', () => {
      renameChapter('ch1', '  Opening  ');
      expect(store.chapters[0].title).toBe('Opening');
    });

    it('ignores empty titles', () => {
      renameChapter('ch1', '   ');
      expect(store.chapters[0].title).toBe('Chapter 1');
    });

    it('is a no-op for unknown ids', () => {
      renameChapter('nope', 'Nope');
      expect(store.chapters[0].title).toBe('Chapter 1');
    });
  });

  describe('setActiveChapter', () => {
    it('updates activeChapterId when the chapter exists', () => {
      const result = createChapter()!;
      setActiveChapter('ch1');
      expect(store.activeChapterId).toBe('ch1');
      setActiveChapter(result.chapterId);
      expect(store.activeChapterId).toBe(result.chapterId);
    });

    it('is a no-op for unknown ids', () => {
      setActiveChapter('nope');
      expect(store.activeChapterId).toBe('ch1');
    });
  });

  describe('moveBlock', () => {
    it('swaps with the previous block when moving up', () => {
      const ok = moveBlock('b2', 'up');
      expect(ok).toBe(true);
      expect(store.blockOrder).toEqual(['b2', 'b1', 'b3']);
    });

    it('swaps with the next block when moving down', () => {
      const ok = moveBlock('b2', 'down');
      expect(ok).toBe(true);
      expect(store.blockOrder).toEqual(['b1', 'b3', 'b2']);
    });

    it('swaps the persisted order field on both blocks', () => {
      moveBlock('b2', 'up');
      expect(store.blocks['b1'].order).toBe(1);
      expect(store.blocks['b2'].order).toBe(0);
    });

    it('no-op at the top when moving up', () => {
      const ok = moveBlock('b1', 'up');
      expect(ok).toBe(false);
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });

    it('no-op at the bottom when moving down', () => {
      const ok = moveBlock('b3', 'down');
      expect(ok).toBe(false);
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });

    it('is a no-op for unknown ids', () => {
      const ok = moveBlock('nope', 'up');
      expect(ok).toBe(false);
    });

    it('does not cross chapter boundaries', () => {
      // Create a second chapter — its first block sits at the end of blockOrder.
      const result = createChapter()!;
      const lastOfCh1 = 'b3';
      const firstOfCh2 = result.blockId;
      // b3 is the last block of chapter 1; moving it down should NOT swap
      // with the first block of chapter 2.
      const ok = moveBlock(lastOfCh1, 'down');
      expect(ok).toBe(false);
      expect(store.blockOrder.indexOf(lastOfCh1)).toBeLessThan(
        store.blockOrder.indexOf(firstOfCh2),
      );
    });
  });

  describe('deleteBlock soft-delete', () => {
    it('removes from blockOrder but keeps the row flagged in store.blocks', () => {
      deleteBlock('b2');
      expect(store.blockOrder).toEqual(['b1', 'b3']);
      expect(store.blocks['b2']).toBeDefined();
      expect(store.blocks['b2'].deleted_at).toBeTruthy();
      expect(store.blocks['b2'].deleted_from).toMatchObject({
        chapter_id: 'ch1',
        chapter_title: 'Chapter 1',
        position: 1,
      });
    });

    it('is a no-op for unknown ids', () => {
      deleteBlock('nope');
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });
  });
});
