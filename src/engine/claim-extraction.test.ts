import { describe, it, expect } from 'vitest';
import { extractSentences, candidatePairs } from './claim-extraction';
import type { Block, UUID } from '@/types';

function mkBlock(id: UUID, content: string): Block {
  return {
    id,
    chapter_id: 'c1',
    type: 'text',
    content,
    order: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: 't0',
    updated_at: 't0',
  };
}

describe('extractSentences', () => {
  it('drops blocks without any tracked character', () => {
    const out = extractSentences(
      [mkBlock('b1', 'She walked outside.')],
      { b1: [] },
      'en',
    );
    expect(out).toEqual([]);
  });

  it('drops sentences that mention a character but have no trigger word', () => {
    const out = extractSentences(
      [mkBlock('b1', 'Ivan walked outside.')],
      { b1: ['ivan'] },
      'en',
    );
    expect(out).toEqual([]);
  });

  it('keeps sentences mentioning a tracked character AND a trigger word', () => {
    const out = extractSentences(
      [mkBlock('b1', "Ivan's brother Pyotr was a fiddler.")],
      { b1: ['ivan'] },
      'en',
    );
    expect(out).toHaveLength(1);
    expect(out[0].blockId).toBe('b1');
    expect(out[0].text).toMatch(/Pyotr/);
    expect(out[0].characterIds).toEqual(['ivan']);
    expect([...out[0].categories].sort()).toEqual(['kinship', 'profession']);
  });

  it('splits a multi-sentence block and scores each sentence independently', () => {
    const block = mkBlock(
      'b1',
      "Ivan's brother arrived. Later he smiled. Ivan had green eyes.",
    );
    const out = extractSentences([block], { b1: ['ivan'] }, 'en');
    // Sentence 1: has 'ivan' + kinship → kept
    // Sentence 2: no tracked character → dropped
    // Sentence 3: has 'ivan' + body ('eyes') → kept
    expect(out).toHaveLength(2);
    expect(out[0].sentenceIdx).toBe(0);
    expect(out[1].sentenceIdx).toBe(2);
  });

  it('skips deleted blocks', () => {
    const block: Block = {
      ...mkBlock('b1', "Ivan's brother arrived."),
      deleted_at: '2026-04-17T00:00:00Z',
    };
    const out = extractSentences([block], { b1: ['ivan'] }, 'en');
    expect(out).toEqual([]);
  });
});

describe('candidatePairs', () => {
  const sA = {
    blockId: 'b1' as UUID,
    sentenceIdx: 0,
    text: "Ivan's brother Pyotr was a fiddler.",
    characterIds: ['ivan'] as UUID[],
    categories: new Set<'kinship' | 'body' | 'profession'>(['kinship', 'profession']),
  };
  const sB = {
    blockId: 'b2' as UUID,
    sentenceIdx: 0,
    text: "Ivan's cousin Pyotr came home drunk.",
    characterIds: ['ivan'] as UUID[],
    categories: new Set<'kinship' | 'body' | 'profession'>(['kinship']),
  };
  const sC = {
    blockId: 'b3' as UUID,
    sentenceIdx: 0,
    text: 'Her eyes were blue.',
    characterIds: ['marta'] as UUID[],
    categories: new Set<'kinship' | 'body' | 'profession'>(['body']),
  };
  const sD = {
    blockId: 'b4' as UUID,
    sentenceIdx: 0,
    text: "Ivan's eyes were sharp.",
    characterIds: ['ivan'] as UUID[],
    categories: new Set<'kinship' | 'body' | 'profession'>(['body']),
  };

  it('pairs two sentences sharing a character and a category', () => {
    const pairs = candidatePairs([sA, sB]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].characterId).toBe('ivan');
    expect(pairs[0].a).toBe(sA);
    expect(pairs[0].b).toBe(sB);
  });

  it('rejects pairs with no shared character', () => {
    const pairs = candidatePairs([sA, sC]);
    expect(pairs).toEqual([]);
  });

  it('rejects pairs with no shared category', () => {
    // sA has kinship+profession; sD has body only. No overlap.
    const pairs = candidatePairs([sA, sD]);
    expect(pairs).toEqual([]);
  });

  it('returns nothing for a single sentence', () => {
    expect(candidatePairs([sA])).toEqual([]);
  });

  it('produces N*(N-1)/2 pairs for N fully-overlapping sentences', () => {
    const s1 = { ...sA, blockId: 'x1' as UUID };
    const s2 = { ...sA, blockId: 'x2' as UUID };
    const s3 = { ...sA, blockId: 'x3' as UUID };
    expect(candidatePairs([s1, s2, s3])).toHaveLength(3);
  });

  it('emits one pair per shared character, not per shared category', () => {
    // sA + sB share kinship only. But if we extend them to also share body
    // (same character, two categories in common), we still want ONE pair.
    const sA2 = {
      ...sA,
      categories: new Set<'kinship' | 'body' | 'profession'>(['kinship', 'body']),
    };
    const sB2 = {
      ...sB,
      categories: new Set<'kinship' | 'body' | 'profession'>(['kinship', 'body']),
    };
    expect(candidatePairs([sA2, sB2])).toHaveLength(1);
  });
});
