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

  it('round-trips the extended document fields (author, synopsis, settings, pov)', () => {
    const full: SyncBundle = {
      payloadVersion: 1,
      document: {
        id: 'd1',
        title: 'T',
        created_at: 'a',
        updated_at: 'b',
        author: 'Author A',
        synopsis: 'Short blurb.',
        settings: { font_family: 'Georgia, serif', font_size: 16, theme: 'dark' },
        pov_character_id: 'ch1',
      },
      chapters: [],
      blocks: [],
      characters: [],
      sentiments: [],
    };
    expect(parseFromSync(serializeForSync(full))).toEqual(full);
  });

  it('parses legacy v1 bundles without the extended document fields', () => {
    // Bundles produced before author/synopsis/settings/pov_character_id were
    // added must still parse — those fields are typed as optional.
    const legacy = JSON.stringify({
      payloadVersion: 1,
      document: { id: 'd1', title: 'T', created_at: 'a', updated_at: 'b' },
      chapters: [], blocks: [], characters: [], sentiments: [],
    });
    const parsed = parseFromSync(new TextEncoder().encode(legacy));
    expect(parsed.document.author).toBeUndefined();
    expect(parsed.document.synopsis).toBeUndefined();
    expect(parsed.document.settings).toBeUndefined();
    expect(parsed.document.pov_character_id).toBeUndefined();
  });

  it('rejects an unsupported payloadVersion', () => {
    const future = JSON.stringify({ payloadVersion: 2, document: { id: '', title: '', created_at: '', updated_at: '' }, chapters: [], blocks: [], characters: [], sentiments: [] });
    expect(() => parseFromSync(new TextEncoder().encode(future))).toThrow(/payloadVersion/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseFromSync(new TextEncoder().encode('not json'))).toThrow();
  });
});
