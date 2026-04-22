import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import {
  store,
  loadSyntheticDoc,
  updateBlockContent,
  createBlockAfter,
  deleteBlock,
  setPersistEnabled,
  createChapter,
  deleteChapter,
  renameChapter,
  setActiveChapter,
  moveBlock,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  setInconsistencyFlag,
} from './document';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document, InconsistencyFlag } from '@/types';
import { contentHash } from '@/utils/hash';

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
    kind: 'standard',
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
    pov_character_id: null,
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

  describe('multi-line content (Shift+Enter soft break)', () => {
    it('preserves embedded newlines in block content', () => {
      updateBlockContent('b1', 'first line\nsecond line\nthird line');
      expect(store.blocks['b1'].content).toBe('first line\nsecond line\nthird line');
      expect(store.blocks['b1'].content.split('\n')).toHaveLength(3);
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

  describe('deleteChapter', () => {
    it('refuses to delete the last remaining chapter', () => {
      const result = deleteChapter('ch1');
      expect(result).toBe(false);
      expect(store.chapters).toHaveLength(1);
    });

    it('removes the chapter row and soft-deletes its blocks', () => {
      const { chapterId } = createChapter()!;
      // ch1 has 3 blocks from the fixture.
      const ch1Blocks = ['b1', 'b2', 'b3'];
      const result = deleteChapter('ch1');
      expect(result).toBe(true);
      expect(store.chapters.find((c) => c.id === 'ch1')).toBeUndefined();
      for (const id of ch1Blocks) {
        expect(store.blocks[id].deleted_at).not.toBeNull();
        expect(store.blocks[id].deleted_from?.chapter_title).toBe('Chapter 1');
        expect(store.blockOrder).not.toContain(id);
      }
      // Active chapter jumps to the surviving one.
      expect(store.activeChapterId).toBe(chapterId);
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

  describe('characters', () => {
    it('createCharacter triggers rescan and detects mentions in existing blocks', () => {
      updateBlockContent('b1', 'Márton hazaért.');
      updateBlockContent('b2', 'Semmi érdekes itt.');
      const c = createCharacter('Márton')!;
      expect(store.characterMentions['b1']).toContain(c.id);
      expect(store.characterMentions['b2'] ?? []).not.toContain(c.id);
    });

    it('deleteCharacter clears mentions', () => {
      updateBlockContent('b1', 'Márton hazaért.');
      const c = createCharacter('Márton')!;
      expect(store.characterMentions['b1']).toContain(c.id);
      deleteCharacter(c.id);
      const remaining = store.characterMentions['b1'] ?? [];
      expect(remaining).not.toContain(c.id);
    });

    it('createCharacter appends to store.characters with a trimmed name', () => {
      const c = createCharacter('  Márton  ');
      expect(c).not.toBeNull();
      expect(store.characters).toHaveLength(1);
      expect(store.characters[0].name).toBe('Márton');
      expect(store.characters[0].color).toBeTruthy();
      expect(store.characters[0].aliases).toEqual([]);
    });

    it('createCharacter rejects empty names', () => {
      const c = createCharacter('   ');
      expect(c).toBeNull();
      expect(store.characters).toHaveLength(0);
    });

    it('createCharacter cycles through default colors', () => {
      createCharacter('A');
      createCharacter('B');
      expect(store.characters[0].color).not.toBe(store.characters[1].color);
    });

    it('updateCharacter patches name/notes/color', () => {
      const c = createCharacter('Réka')!;
      updateCharacter(c.id, { name: 'Réka-2', notes: 'protagonist' });
      const updated = store.characters.find((x) => x.id === c.id)!;
      expect(updated.name).toBe('Réka-2');
      expect(updated.notes).toBe('protagonist');
    });

    it('updateCharacter ignores empty-string name and keeps the old one', () => {
      const c = createCharacter('Béla')!;
      updateCharacter(c.id, { name: '   ' });
      expect(store.characters.find((x) => x.id === c.id)!.name).toBe('Béla');
    });

    it('deleteCharacter removes from the list', () => {
      const c = createCharacter('Doomed')!;
      deleteCharacter(c.id);
      expect(store.characters.find((x) => x.id === c.id)).toBeUndefined();
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

  describe('inconsistency flag edit invalidation', () => {
    function makeFlag(
      id: string,
      blockAId: string,
      contentA: string,
      blockBId: string,
      contentB: string,
    ): InconsistencyFlag {
      return {
        id,
        document_id: 'd1',
        character_id: 'c1',
        block_a_id: blockAId,
        block_a_hash: contentHash(contentA),
        block_a_sentence_idx: 0,
        block_a_sentence: contentA,
        block_b_id: blockBId,
        block_b_hash: contentHash(contentB),
        block_b_sentence_idx: 0,
        block_b_sentence: contentB,
        trigger_categories: ['body'],
        contradiction_score: 0.9,
        status: 'active',
        created_at: 1,
        dismissed_at: null,
      };
    }

    it('removes a flag when the block_a content changes', () => {
      setInconsistencyFlag(makeFlag('f1', 'b1', 'first', 'b2', 'second'));
      expect(store.inconsistencyFlags['f1']).toBeDefined();

      updateBlockContent('b1', 'first edited');
      expect(store.inconsistencyFlags['f1']).toBeUndefined();
    });

    it('removes a flag when the block_b content changes', () => {
      setInconsistencyFlag(makeFlag('f2', 'b1', 'first', 'b2', 'second'));
      updateBlockContent('b2', 'second edited');
      expect(store.inconsistencyFlags['f2']).toBeUndefined();
    });

    it('does not remove a flag when an unrelated block is edited', () => {
      setInconsistencyFlag(makeFlag('f3', 'b1', 'first', 'b2', 'second'));
      updateBlockContent('b3', 'third edited');
      expect(store.inconsistencyFlags['f3']).toBeDefined();
    });

    it('leaves the flag intact when the content is rewritten to the same value', () => {
      setInconsistencyFlag(makeFlag('f4', 'b1', 'first', 'b2', 'second'));
      updateBlockContent('b1', 'first');
      expect(store.inconsistencyFlags['f4']).toBeDefined();
    });

    it('removes every flag that references the edited block', () => {
      setInconsistencyFlag(makeFlag('f5', 'b1', 'first', 'b2', 'second'));
      setInconsistencyFlag(makeFlag('f6', 'b1', 'first', 'b3', 'third'));
      setInconsistencyFlag(makeFlag('f7', 'b2', 'second', 'b3', 'third'));

      updateBlockContent('b1', 'rewritten');

      expect(store.inconsistencyFlags['f5']).toBeUndefined();
      expect(store.inconsistencyFlags['f6']).toBeUndefined();
      // f7 doesn't reference b1, so it stays.
      expect(store.inconsistencyFlags['f7']).toBeDefined();
    });
  });
});
