import { describe, it, expect, afterEach } from 'vitest';
import {
  __setTestDb,
  saveBlock,
  softDeleteBlock,
  loadDocument,
  listDocuments,
  saveSentiment,
  loadSentiments,
  saveRevision,
  loadRevisions,
  saveInconsistencyFlag,
  loadInconsistencyFlagsByDocument,
  loadInconsistencyFlagsByCharacter,
  loadInconsistencyFlagsByBlock,
  deleteInconsistencyFlag,
  setInconsistencyFlagStatus,
  isTitleTaken,
  disambiguateTitle,
  type DbLike,
} from './repository';
import type { Block, InconsistencyFlag } from '@/types';
import type {
  BlockRevisionRow,
  BlockRow,
  ChapterRow,
  CharacterRow,
  DocumentRow,
  InconsistencyRow,
  SentimentRow,
} from './connection';

interface MockState {
  documents: DocumentRow[];
  chapters: ChapterRow[];
  blocks: BlockRow[];
  sentiments: SentimentRow[];
  characters: CharacterRow[];
  blockRevisions: BlockRevisionRow[];
  inconsistencies: InconsistencyRow[];
  softDeleteCalls: Array<{ id: string; deletedAt: string; deletedFrom: unknown }>;
}

function createMockDb(): { db: DbLike; state: MockState } {
  const state: MockState = {
    documents: [],
    chapters: [],
    blocks: [],
    sentiments: [],
    characters: [],
    blockRevisions: [],
    inconsistencies: [],
    softDeleteCalls: [],
  };
  const db: DbLike = {
    documents: {
      async put(row) {
        const idx = state.documents.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.documents[idx] = row;
        else state.documents.push(row);
      },
      async getAll() {
        return state.documents.slice();
      },
      async get(id) {
        return state.documents.find((r) => r.id === id);
      },
    },
    chapters: {
      async put(row) {
        const idx = state.chapters.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.chapters[idx] = row;
        else state.chapters.push(row);
      },
      async getAllByDocument(documentId) {
        return state.chapters.filter((r) => r.document_id === documentId);
      },
      async delete(id) {
        const idx = state.chapters.findIndex((r) => r.id === id);
        if (idx >= 0) state.chapters.splice(idx, 1);
      },
    },
    blocks: {
      async put(row) {
        const idx = state.blocks.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.blocks[idx] = row;
        else state.blocks.push(row);
      },
      async getAllByDocument(documentId) {
        return state.blocks.filter((r) => r.document_id === documentId);
      },
      async softDelete(id, deletedAt, deletedFrom) {
        state.softDeleteCalls.push({ id, deletedAt, deletedFrom });
        const row = state.blocks.find((r) => r.id === id);
        if (row) {
          row.deleted_at = deletedAt;
          row.deleted_from = deletedFrom;
          row.updated_at = deletedAt;
        }
      },
    },
    sentiments: {
      async put(row) {
        const idx = state.sentiments.findIndex((r) => r.block_id === row.block_id);
        if (idx >= 0) state.sentiments[idx] = row;
        else state.sentiments.push(row);
      },
      async getAllByDocument(documentId) {
        return state.sentiments.filter((r) => r.document_id === documentId);
      },
    },
    characters: {
      async put(row) {
        const idx = state.characters.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.characters[idx] = row;
        else state.characters.push(row);
      },
      async getAllByDocument(documentId) {
        return state.characters.filter((r) => r.document_id === documentId);
      },
      async delete(id) {
        const idx = state.characters.findIndex((r) => r.id === id);
        if (idx >= 0) state.characters.splice(idx, 1);
      },
    },
    blockRevisions: {
      async put(row) {
        const idx = state.blockRevisions.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.blockRevisions[idx] = row;
        else state.blockRevisions.push(row);
      },
      async getAllByBlock(blockId) {
        return state.blockRevisions.filter((r) => r.block_id === blockId);
      },
      async delete(id) {
        const idx = state.blockRevisions.findIndex((r) => r.id === id);
        if (idx >= 0) state.blockRevisions.splice(idx, 1);
      },
    },
    inconsistencies: {
      async put(row) {
        const idx = state.inconsistencies.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.inconsistencies[idx] = row;
        else state.inconsistencies.push(row);
      },
      async get(id) {
        return state.inconsistencies.find((r) => r.id === id);
      },
      async getAllByDocument(documentId) {
        return state.inconsistencies.filter((r) => r.document_id === documentId);
      },
      async getAllByCharacter(characterId) {
        return state.inconsistencies.filter((r) => r.character_id === characterId);
      },
      async getAllByBlock(blockId) {
        return state.inconsistencies.filter(
          (r) => r.block_a_id === blockId || r.block_b_id === blockId,
        );
      },
      async delete(id) {
        const idx = state.inconsistencies.findIndex((r) => r.id === id);
        if (idx >= 0) state.inconsistencies.splice(idx, 1);
      },
    },
  };
  return { db, state };
}

function makeFlag(overrides: Partial<InconsistencyFlag> = {}): InconsistencyFlag {
  return {
    id: 'flag-1',
    document_id: 'doc-1',
    character_id: 'char-1',
    block_a_id: 'blk-a',
    block_a_hash: 'ha',
    block_a_sentence_idx: 0,
    block_a_sentence: 'Ivan has a brother Pyotr.',
    block_b_id: 'blk-b',
    block_b_hash: 'hb',
    block_b_sentence_idx: 2,
    block_b_sentence: "Pyotr, Ivan's cousin, came home drunk.",
    trigger_categories: ['kinship'],
    contradiction_score: 0.88,
    status: 'active',
    created_at: 1_700_000_000_000,
    dismissed_at: null,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  const now = '2026-04-14T12:00:00.000Z';
  return {
    id: 'block-1',
    chapter_id: 'chap-1',
    type: 'text',
    content: 'hello',
    order: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

afterEach(() => __setTestDb(null));

describe('saveBlock', () => {
  it('writes block row with order_idx and document_id', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveBlock(makeBlock({ order: 3 }), 'doc-1');
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]).toMatchObject({
      id: 'block-1',
      order_idx: 3,
      document_id: 'doc-1',
    });
  });
});

describe('softDeleteBlock', () => {
  it('records deletion metadata without removing the row', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveBlock(makeBlock(), 'doc-1');
    await softDeleteBlock('block-1', {
      chapter_id: 'chap-1',
      chapter_title: 'Ch 1',
      position: 0,
    });
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].deleted_at).toBeTruthy();
    expect(state.blocks[0].deleted_from).toMatchObject({
      chapter_id: 'chap-1',
      position: 0,
    });
    expect(state.softDeleteCalls).toHaveLength(1);
  });
});

describe('block revisions', () => {
  it('dedups identical consecutive content', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveRevision({
      blockId: 'b1',
      documentId: 'd1',
      content: 'hello',
      snapshotAt: '2026-04-14T12:00:00.000Z',
    });
    await saveRevision({
      blockId: 'b1',
      documentId: 'd1',
      content: 'hello',
      snapshotAt: '2026-04-14T12:00:01.000Z',
    });
    expect(state.blockRevisions).toHaveLength(1);
  });

  it('caps per-block history at 20 entries', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    for (let i = 0; i < 51; i++) {
      await saveRevision({
        blockId: 'b1',
        documentId: 'd1',
        content: `v${i}`,
        snapshotAt: `2026-04-14T12:00:${String(i).padStart(2, '0')}.000Z`,
      });
    }
    expect(state.blockRevisions).toHaveLength(50);
    // Oldest entries trimmed; newest preserved.
    const contents = state.blockRevisions.map((r) => r.content).sort();
    expect(contents).toContain('v50');
    expect(contents).not.toContain('v0');
  });

  it('loadRevisions returns newest first', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    await saveRevision({
      blockId: 'b1',
      documentId: 'd1',
      content: 'first',
      snapshotAt: '2026-04-14T12:00:00.000Z',
    });
    await saveRevision({
      blockId: 'b1',
      documentId: 'd1',
      content: 'second',
      snapshotAt: '2026-04-14T12:00:01.000Z',
    });
    const revs = await loadRevisions('b1');
    expect(revs[0].content).toBe('second');
    expect(revs[1].content).toBe('first');
  });
});

describe('loadDocument', () => {
  it('filters soft-deleted blocks and sorts by order_idx', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    const now = '2026-04-14T12:00:00.000Z';
    state.documents.push({
      id: 'doc-1',
      title: 'T',
      author: '',
      synopsis: '',
      settings: {},
      created_at: now,
      updated_at: now,
      sync_enabled: false,
      last_sync_revision: 0,
      last_synced_at: null,
    });
    state.blocks.push(
      {
        id: 'b2',
        document_id: 'doc-1',
        chapter_id: 'c1',
        type: 'text',
        content: 'second',
        order_idx: 1,
        metadata: { type: 'text' },
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'b1',
        document_id: 'doc-1',
        chapter_id: 'c1',
        type: 'text',
        content: 'first',
        order_idx: 0,
        metadata: { type: 'text' },
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'b3-gone',
        document_id: 'doc-1',
        chapter_id: 'c1',
        type: 'text',
        content: 'deleted',
        order_idx: 2,
        metadata: { type: 'text' },
        deleted_at: now,
        deleted_from: { chapter_id: 'c1', chapter_title: '', position: 2 },
        created_at: now,
        updated_at: now,
      },
    );
    const loaded = await loadDocument('doc-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('returns null when document row missing', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    const result = await loadDocument('nope');
    expect(result).toBeNull();
  });
});

describe('sentiments', () => {
  it('saveSentiment + loadSentiments roundtrips by document', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveSentiment('doc-1', {
      blockId: 'b1',
      label: 'positive',
      score: 0.83,
      contentHash: 'abc',
      analyzedAt: '2026-04-14T21:00:00.000Z',
    });
    await saveSentiment('doc-1', {
      blockId: 'b2',
      label: 'negative',
      score: 0.91,
      contentHash: 'def',
      analyzedAt: '2026-04-14T21:00:01.000Z',
    });
    await saveSentiment('doc-other', {
      blockId: 'b3',
      label: 'neutral',
      score: 0.55,
      contentHash: 'ghi',
      analyzedAt: '2026-04-14T21:00:02.000Z',
    });
    expect(state.sentiments).toHaveLength(3);

    const doc1 = await loadSentiments('doc-1');
    expect(doc1).toHaveLength(2);
    expect(doc1.map((s) => s.blockId).sort()).toEqual(['b1', 'b2']);
    const b1 = doc1.find((s) => s.blockId === 'b1');
    expect(b1?.label).toBe('positive');
    expect(b1?.score).toBeCloseTo(0.83);
  });

  it('saveSentiment updates rather than duplicates on rerun', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveSentiment('doc-1', {
      blockId: 'b1',
      label: 'positive',
      score: 0.6,
      contentHash: 'v1',
      analyzedAt: '2026-04-14T21:00:00.000Z',
    });
    await saveSentiment('doc-1', {
      blockId: 'b1',
      label: 'negative',
      score: 0.8,
      contentHash: 'v2',
      analyzedAt: '2026-04-14T21:00:10.000Z',
    });
    expect(state.sentiments).toHaveLength(1);
    expect(state.sentiments[0].label).toBe('negative');
  });
});

describe('listDocuments', () => {
  it('returns documents sorted by created_at ascending', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(
      {
        id: 'd2',
        title: 'Second',
        author: '',
        synopsis: '',
        settings: {},
        created_at: '2026-04-14T12:00:02.000Z',
        updated_at: '2026-04-14T12:00:02.000Z',
        sync_enabled: false,
        last_sync_revision: 0,
        last_synced_at: null,
      },
      {
        id: 'd1',
        title: 'First',
        author: '',
        synopsis: '',
        settings: {},
        created_at: '2026-04-14T12:00:01.000Z',
        updated_at: '2026-04-14T12:00:01.000Z',
        sync_enabled: false,
        last_sync_revision: 0,
        last_synced_at: null,
      },
    );
    const docs = await listDocuments();
    expect(docs.map((d) => d.title)).toEqual(['First', 'Second']);
  });
});

describe('sentiment source roundtrip', () => {
  it('persists and reads back the source field', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveSentiment('doc-1', {
      blockId: 'b1',
      label: 'tender',
      score: 0.9,
      contentHash: 'h1',
      analyzedAt: '2026-04-17T00:00:00.000Z',
      source: 'deep',
    });
    expect(state.sentiments[0].source).toBe('deep');
    const loaded = await loadSentiments('doc-1');
    expect(loaded[0].source).toBe('deep');
  });

  it('defaults source to light when absent on the row', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    // Simulate a legacy row written before the field existed.
    state.sentiments.push({
      block_id: 'b1',
      document_id: 'doc-1',
      label: 'positive',
      score: 0.8,
      content_hash: 'h',
      analyzed_at: '2026-04-14T00:00:00.000Z',
    });
    const loaded = await loadSentiments('doc-1');
    expect(loaded[0].source).toBe('light');
  });
});

describe('inconsistency flag repository', () => {
  it('saves and loads by document', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(makeFlag({ id: 'f1', document_id: 'doc-1' }));
    await saveInconsistencyFlag(makeFlag({ id: 'f2', document_id: 'doc-2' }));
    expect(state.inconsistencies).toHaveLength(2);
    const doc1 = await loadInconsistencyFlagsByDocument('doc-1');
    expect(doc1.map((f) => f.id)).toEqual(['f1']);
  });

  it('loads by character', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(makeFlag({ id: 'f1', character_id: 'ivan' }));
    await saveInconsistencyFlag(makeFlag({ id: 'f2', character_id: 'pyotr' }));
    const ivan = await loadInconsistencyFlagsByCharacter('ivan');
    expect(ivan.map((f) => f.id)).toEqual(['f1']);
  });

  it('loads by block (either side of the pair)', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(makeFlag({ id: 'f1', block_a_id: 'B', block_b_id: 'C' }));
    await saveInconsistencyFlag(makeFlag({ id: 'f2', block_a_id: 'A', block_b_id: 'B' }));
    const hits = await loadInconsistencyFlagsByBlock('B');
    expect(hits.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
  });

  it('deletes a flag by id', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(makeFlag({ id: 'f1' }));
    await deleteInconsistencyFlag('f1');
    expect(state.inconsistencies).toHaveLength(0);
  });

  it('dismissing sets status and timestamp', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(makeFlag({ id: 'f1', status: 'active', dismissed_at: null }));
    await setInconsistencyFlagStatus('f1', 'dismissed');
    expect(state.inconsistencies[0].status).toBe('dismissed');
    expect(state.inconsistencies[0].dismissed_at).toBeGreaterThan(0);
  });

  it('reactivating clears the dismissed timestamp', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await saveInconsistencyFlag(
      makeFlag({ id: 'f1', status: 'dismissed', dismissed_at: 123 }),
    );
    await setInconsistencyFlagStatus('f1', 'active');
    expect(state.inconsistencies[0].status).toBe('active');
    expect(state.inconsistencies[0].dismissed_at).toBeNull();
  });

  it('status update on a missing flag is a no-op', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    await setInconsistencyFlagStatus('does-not-exist', 'dismissed');
    expect(state.inconsistencies).toHaveLength(0);
  });
});

function makeDocRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    title: 'My Book',
    author: '',
    synopsis: '',
    settings: {},
    pov_character_id: null,
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
    sync_enabled: false,
    last_sync_revision: 0,
    last_synced_at: null,
    ...overrides,
  };
}

describe('isTitleTaken', () => {
  it('returns false on an empty library', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    expect(await isTitleTaken('My Book')).toBe(false);
  });

  it('returns true when another doc has the same title (exact match)', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My Book' }));
    expect(await isTitleTaken('My Book')).toBe(true);
  });

  it('compares case-insensitively', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My Book' }));
    expect(await isTitleTaken('my book')).toBe(true);
    expect(await isTitleTaken('MY BOOK')).toBe(true);
  });

  it('trims surrounding whitespace before comparing', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My Book' }));
    expect(await isTitleTaken('  My Book  ')).toBe(true);
  });

  it('preserves internal whitespace differences', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My  Book' }));
    expect(await isTitleTaken('My Book')).toBe(false);
  });

  it('excludes the renaming doc itself when an excludeDocId is given', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My Book' }));
    expect(await isTitleTaken('My Book', 'doc-1')).toBe(false);
    expect(await isTitleTaken('My Book', 'doc-2')).toBe(true);
  });
});

describe('disambiguateTitle', () => {
  it('returns the original title when nothing collides', async () => {
    const { db } = createMockDb();
    __setTestDb(db);
    expect(await disambiguateTitle('My Book')).toBe('My Book');
  });

  it('appends " (2)" when the bare title is taken', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'doc-1', title: 'My Book' }));
    expect(await disambiguateTitle('My Book')).toBe('My Book (2)');
  });

  it('skips already-used " (n)" suffixes and finds the next free one', async () => {
    const { db, state } = createMockDb();
    __setTestDb(db);
    state.documents.push(makeDocRow({ id: 'd1', title: 'My Book' }));
    state.documents.push(makeDocRow({ id: 'd2', title: 'My Book (2)' }));
    state.documents.push(makeDocRow({ id: 'd3', title: 'My Book (3)' }));
    expect(await disambiguateTitle('My Book')).toBe('My Book (4)');
  });
});

