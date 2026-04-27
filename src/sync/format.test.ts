// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { serializeForSync, parseFromSync, type SyncBundle } from './format';

const minimal: SyncBundle = {
  payloadVersion: 1,
  document: { id: 'd1', title: 'T', created_at: 'a', updated_at: 'b' },
  chapters: [],
  blocks: [],
  characters: [],
  sentiments: [],
};

describe('sync format', () => {
  it('round-trips a minimal bundle', () => {
    const serialized = serializeForSync(minimal);
    const parsed = parseFromSync(serialized);
    expect(parsed).toEqual(minimal);
  });

  it('serialized output is a Uint8Array (suitable for AES-GCM input)', () => {
    expect(serializeForSync(minimal)).toBeInstanceOf(Uint8Array);
  });

  it('round-trips a richer bundle with chapters and blocks', () => {
    const rich: SyncBundle = {
      payloadVersion: 1,
      document: { id: 'd1', title: 'T', created_at: 'a', updated_at: 'b' },
      chapters: [{ id: 'c1', title: 'Ch 1', kind: 'standard', position: 0 }],
      blocks: [{ id: 'b1', chapter_id: 'c1', kind: 'text', content: 'hello', position: 0 }],
      characters: [{ id: 'ch1', name: 'Alice', color: '#7F77DD' }],
      sentiments: [{ block_id: 'b1', label: 'positive', score: 0.83 }],
    };
    const parsed = parseFromSync(serializeForSync(rich));
    expect(parsed).toEqual(rich);
  });

  it('rejects an unsupported payloadVersion', () => {
    const future = JSON.stringify({ payloadVersion: 2, document: { id: '', title: '', created_at: '', updated_at: '' }, chapters: [], blocks: [], characters: [], sentiments: [] });
    expect(() => parseFromSync(new TextEncoder().encode(future))).toThrow(/payloadVersion/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseFromSync(new TextEncoder().encode('not json'))).toThrow();
  });
});
