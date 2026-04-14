import { describe, it, expect, afterEach } from 'vitest';
import {
  __setTestDb,
  saveBlock,
  softDeleteBlock,
  loadDocument,
  listDocuments,
} from './repository';
import type { Block } from '@/types';

interface Call {
  sql: string;
  vars: Record<string, unknown>;
}

function mockDb(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      async query(sql: string, vars: Record<string, unknown> = {}) {
        calls.push({ sql, vars });
        for (const [needle, value] of Object.entries(responses)) {
          if (sql.includes(needle)) return value;
        }
        return [[]];
      },
    },
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
  it('sends UPDATE with block row including order_idx', async () => {
    const { calls, db } = mockDb({});
    __setTestDb(db);
    await saveBlock(makeBlock({ order: 3 }), 'doc-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("type::thing('block'");
    expect(calls[0].vars.row).toMatchObject({ order_idx: 3, document_id: 'doc-1' });
  });
});

describe('softDeleteBlock', () => {
  it('sets deleted_at and deleted_from without removing the row', async () => {
    const { calls, db } = mockDb({});
    __setTestDb(db);
    await softDeleteBlock('block-1', {
      chapter_id: 'chap-1',
      chapter_title: 'Ch 1',
      position: 0,
    });
    expect(calls[0].sql).toContain('deleted_at = $now');
    expect(calls[0].sql).toContain('deleted_from = $df');
    expect(calls[0].vars.df).toMatchObject({ chapter_id: 'chap-1', position: 0 });
  });
});

describe('loadDocument', () => {
  it('filters soft-deleted blocks in SQL', async () => {
    const docRow = {
      id: 'doc-1',
      title: 'T',
      author: '',
      synopsis: '',
      settings: {},
      created_at: 'x',
      updated_at: 'x',
    };
    const { calls, db } = mockDb({
      'FROM document WHERE': [[docRow]],
      'FROM chapter WHERE': [[]],
      'FROM block WHERE': [[]],
    });
    __setTestDb(db);
    const result = await loadDocument('doc-1');
    expect(result).not.toBeNull();
    const blockCall = calls.find((c) => c.sql.includes('FROM block WHERE'));
    expect(blockCall?.sql).toContain('deleted_at IS NONE');
    expect(blockCall?.sql).toContain('ORDER BY order_idx ASC');
  });

  it('returns null when document row missing', async () => {
    const { db } = mockDb({ 'FROM document WHERE': [[]] });
    __setTestDb(db);
    const result = await loadDocument('nope');
    expect(result).toBeNull();
  });
});

describe('listDocuments', () => {
  it('returns mapped documents', async () => {
    const row = {
      id: 'd1',
      title: 'Novel',
      author: 'me',
      synopsis: '',
      settings: {},
      created_at: 'a',
      updated_at: 'b',
    };
    const { db } = mockDb({ 'SELECT * FROM document': [[row]] });
    __setTestDb(db);
    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Novel');
  });
});
