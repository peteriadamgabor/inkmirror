import { describe, it, expect, afterEach } from 'vitest';
import {
  __setTestDb,
  saveBlock,
  softDeleteBlock,
  loadDocument,
  listDocuments,
  type DbLike,
} from './repository';
import type { Block } from '@/types';
import type { BlockRow, ChapterRow, DocumentRow } from './connection';

interface MockState {
  documents: DocumentRow[];
  chapters: ChapterRow[];
  blocks: BlockRow[];
  softDeleteCalls: Array<{ id: string; deletedAt: string; deletedFrom: unknown }>;
}

function createMockDb(): { db: DbLike; state: MockState } {
  const state: MockState = {
    documents: [],
    chapters: [],
    blocks: [],
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
  };
  return { db, state };
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
      },
      {
        id: 'd1',
        title: 'First',
        author: '',
        synopsis: '',
        settings: {},
        created_at: '2026-04-14T12:00:01.000Z',
        updated_at: '2026-04-14T12:00:01.000Z',
      },
    );
    const docs = await listDocuments();
    expect(docs.map((d) => d.title)).toEqual(['First', 'Second']);
  });
});
