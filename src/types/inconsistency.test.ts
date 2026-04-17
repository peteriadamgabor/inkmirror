import { describe, it, expect } from 'vitest';
import {
  TRIGGER_CATEGORIES,
  isTriggerCategory,
  makeFlagId,
  type InconsistencyFlag,
} from './inconsistency';

describe('inconsistency types', () => {
  it('TRIGGER_CATEGORIES lists kinship, body, profession', () => {
    expect([...TRIGGER_CATEGORIES]).toEqual(['kinship', 'body', 'profession']);
  });

  it('isTriggerCategory accepts each known category', () => {
    for (const c of TRIGGER_CATEGORIES) expect(isTriggerCategory(c)).toBe(true);
  });

  it('isTriggerCategory rejects unknown categories', () => {
    expect(isTriggerCategory('timeline')).toBe(false);
    expect(isTriggerCategory('')).toBe(false);
    expect(isTriggerCategory(undefined)).toBe(false);
  });

  it('makeFlagId is stable across the same inputs', () => {
    const a = makeFlagId('doc1', 'blkA', 0, 'blkB', 2);
    const b = makeFlagId('doc1', 'blkA', 0, 'blkB', 2);
    expect(a).toBe(b);
  });

  it('makeFlagId is symmetric regardless of block argument order', () => {
    const ab = makeFlagId('doc1', 'blkA', 0, 'blkB', 2);
    const ba = makeFlagId('doc1', 'blkB', 2, 'blkA', 0);
    expect(ab).toBe(ba);
  });

  it('makeFlagId differentiates by document and block combination', () => {
    expect(makeFlagId('doc1', 'a', 0, 'b', 1)).not.toBe(makeFlagId('doc2', 'a', 0, 'b', 1));
    expect(makeFlagId('doc1', 'a', 0, 'b', 1)).not.toBe(makeFlagId('doc1', 'a', 0, 'b', 2));
  });

  it('InconsistencyFlag has the expected shape (type compile-check)', () => {
    const flag: InconsistencyFlag = {
      id: 'x',
      document_id: 'd',
      character_id: 'c',
      block_a_id: 'ba',
      block_a_hash: 'h1',
      block_a_sentence_idx: 0,
      block_a_sentence: 'foo',
      block_b_id: 'bb',
      block_b_hash: 'h2',
      block_b_sentence_idx: 1,
      block_b_sentence: 'bar',
      trigger_categories: ['kinship'],
      contradiction_score: 0.9,
      status: 'active',
      created_at: 1,
      dismissed_at: null,
    };
    expect(flag.status).toBe('active');
  });
});
