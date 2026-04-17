import { describe, it, expect, beforeEach } from 'vitest';
import {
  visibleBlocksInChapter,
  allVisibleBlocks,
  dialogueBlocksForSpeaker,
  chapterLabelTally,
  dominantChapterLabel,
} from './selectors';
import {
  hydrateFromLoaded,
  setSentiment,
  store,
} from './document';
import type { Block, Chapter, Character, Document } from '@/types';
import type { LoadedDocument } from '@/db/repository';

function makeLoaded(): LoadedDocument {
  const now = '2026-04-18T00:00:00.000Z';
  const doc: Document = {
    id: 'd1',
    title: 'Selectors Fixture',
    author: '',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: now,
    updated_at: now,
  };
  const chapters: Chapter[] = [
    { id: 'c1', document_id: 'd1', title: 'One', order: 0, kind: 'standard', created_at: now, updated_at: now },
    { id: 'c2', document_id: 'd1', title: 'Two', order: 1, kind: 'standard', created_at: now, updated_at: now },
  ];
  const blocks: Block[] = [
    // c1: 3 blocks — two Alice dialogues + one long text
    { id: 'b1', chapter_id: 'c1', type: 'dialogue', content: 'Hi.',
      order: 0, metadata: { type: 'dialogue', data: { speaker_id: 'alice' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now },
    { id: 'b2', chapter_id: 'c1', type: 'dialogue', content: 'Again.',
      order: 1, metadata: { type: 'dialogue', data: { speaker_id: 'alice' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now },
    { id: 'b3', chapter_id: 'c1', type: 'text',
      content: 'A long narrative paragraph with many many many many words here.',
      order: 2, metadata: { type: 'text' },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now },
    // c2: 1 Bob dialogue, 1 soft-deleted block
    { id: 'b4', chapter_id: 'c2', type: 'dialogue', content: 'Yo.',
      order: 0, metadata: { type: 'dialogue', data: { speaker_id: 'bob' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now },
    { id: 'b5', chapter_id: 'c2', type: 'text', content: 'gone',
      order: 1, metadata: { type: 'text' },
      deleted_at: now, deleted_from: { chapter_id: 'c2', chapter_title: 'Two', position: 1 },
      created_at: now, updated_at: now },
  ];
  const characters: Character[] = [
    { id: 'alice', document_id: 'd1', name: 'Alice', aliases: [], notes: '', color: '#000', created_at: now, updated_at: now },
    { id: 'bob', document_id: 'd1', name: 'Bob', aliases: [], notes: '', color: '#fff', created_at: now, updated_at: now },
  ];
  return { document: doc, chapters, blocks, characters, sentiments: [], inconsistencyFlags: [] };
}

describe('selectors — structural', () => {
  beforeEach(() => {
    hydrateFromLoaded(makeLoaded());
  });

  it('visibleBlocksInChapter returns ordered non-deleted blocks', () => {
    const blocks = visibleBlocksInChapter('c1');
    expect(blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('visibleBlocksInChapter excludes soft-deleted blocks', () => {
    const blocks = visibleBlocksInChapter('c2');
    expect(blocks.map((b) => b.id)).toEqual(['b4']);
  });

  it('visibleBlocksInChapter returns empty for unknown chapter', () => {
    expect(visibleBlocksInChapter('ghost')).toEqual([]);
  });

  it('allVisibleBlocks spans every chapter, skips deleted', () => {
    const ids = allVisibleBlocks().map((b) => b.id);
    expect(ids).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  it('dialogueBlocksForSpeaker returns only that speaker\'s dialogue', () => {
    const alice = dialogueBlocksForSpeaker('alice').map((b) => b.id);
    const bob = dialogueBlocksForSpeaker('bob').map((b) => b.id);
    expect(alice).toEqual(['b1', 'b2']);
    expect(bob).toEqual(['b4']);
  });

  it('dialogueBlocksForSpeaker returns empty when the character has no dialogue', () => {
    expect(dialogueBlocksForSpeaker('no-such-character')).toEqual([]);
  });
});

describe('selectors — label aggregation', () => {
  beforeEach(() => {
    hydrateFromLoaded(makeLoaded());
    setSentiment('b1', {
      label: 'positive',
      score: 0.9,
      contentHash: 'h1',
      analyzedAt: '2026-04-18T00:00:00.000Z',
      source: 'light',
    });
    setSentiment('b2', {
      label: 'positive',
      score: 0.8,
      contentHash: 'h2',
      analyzedAt: '2026-04-18T00:00:00.000Z',
      source: 'light',
    });
    setSentiment('b3', {
      label: 'negative',
      score: 0.7,
      contentHash: 'h3',
      analyzedAt: '2026-04-18T00:00:00.000Z',
      source: 'light',
    });
  });

  it('chapterLabelTally counts blocks per label', () => {
    const t = chapterLabelTally('c1');
    expect(t.get('positive')?.count).toBe(2);
    expect(t.get('negative')?.count).toBe(1);
  });

  it('chapterLabelTally accumulates word counts and scores', () => {
    const t = chapterLabelTally('c1');
    const neg = t.get('negative')!;
    // b3 is a long narrative paragraph — far more words than the two
    // short Alice dialogues combined.
    expect(neg.wordCount).toBeGreaterThan(t.get('positive')!.wordCount);
    expect(t.get('positive')?.scoreSum).toBeCloseTo(0.9 + 0.8);
  });

  it('dominantChapterLabel (unweighted) picks the count leader', () => {
    const d = dominantChapterLabel('c1');
    expect(d?.label).toBe('positive');
    expect(d?.analyzed).toBe(3);
    expect(d?.total).toBe(3);
  });

  it('dominantChapterLabel (weighted) picks the word-count leader', () => {
    const d = dominantChapterLabel('c1', { weighted: true });
    // The long narrative paragraph carries the "negative" label and
    // outweighs both short dialogues.
    expect(d?.label).toBe('negative');
  });

  it('dominantChapterLabel returns null for a chapter with no blocks', () => {
    // store currently only has c1 and c2 — but c2 has no sentiments.
    // Unknown chapter id returns null (no blocks at all).
    expect(dominantChapterLabel('ghost')).toBeNull();
  });

  it('dominantChapterLabel returns null when the chapter has blocks but no analyses', () => {
    // c2 has b4 but no sentiments written.
    expect(dominantChapterLabel('c2')).toBeNull();
  });

  // Reset store between suites so other tests don't see the fixture.
  it('smoke-check store is intact (sentiments written through)', () => {
    expect(Object.keys(store.sentiments)).toContain('b1');
  });
});
