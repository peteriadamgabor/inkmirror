/**
 * Shared plumbing for the repository modules — the `DbLike` shape, the
 * `realDb()` adapter that wraps `idb`, and the `db()` accessor that
 * either returns the fake injected by tests or builds a real adapter.
 *
 * Not exported from `@/db/repository`; sibling files import it directly.
 */

import type { Block } from '@/types';
import {
  getDb,
  type BlockRevisionRow,
  type BlockRow,
  type ChapterRow,
  type CharacterRow,
  type DocumentRow,
  type InconsistencyRow,
  type SentimentRow,
  type InkMirrorDb,
} from './connection';

export interface DbLike {
  documents: {
    put(row: DocumentRow): Promise<unknown>;
    getAll(): Promise<DocumentRow[]>;
    get(id: string): Promise<DocumentRow | undefined>;
  };
  chapters: {
    put(row: ChapterRow): Promise<unknown>;
    getAllByDocument(documentId: string): Promise<ChapterRow[]>;
    delete(id: string): Promise<unknown>;
  };
  blocks: {
    put(row: BlockRow): Promise<unknown>;
    getAllByDocument(documentId: string): Promise<BlockRow[]>;
    softDelete(
      id: string,
      deletedAt: string,
      deletedFrom: NonNullable<Block['deleted_from']>,
    ): Promise<void>;
  };
  sentiments: {
    put(row: SentimentRow): Promise<unknown>;
    getAllByDocument(documentId: string): Promise<SentimentRow[]>;
  };
  characters: {
    put(row: CharacterRow): Promise<unknown>;
    getAllByDocument(documentId: string): Promise<CharacterRow[]>;
    delete(id: string): Promise<unknown>;
  };
  blockRevisions: {
    put(row: BlockRevisionRow): Promise<unknown>;
    getAllByBlock(blockId: string): Promise<BlockRevisionRow[]>;
    delete(id: string): Promise<unknown>;
  };
  inconsistencies: {
    put(row: InconsistencyRow): Promise<unknown>;
    get(id: string): Promise<InconsistencyRow | undefined>;
    getAllByDocument(documentId: string): Promise<InconsistencyRow[]>;
    getAllByCharacter(characterId: string): Promise<InconsistencyRow[]>;
    getAllByBlock(blockId: string): Promise<InconsistencyRow[]>;
    delete(id: string): Promise<unknown>;
  };
}

let testDb: DbLike | null = null;

/** Test-only escape hatch: swap the real IDB adapter for an in-memory fake. */
export function __setTestDb(d: DbLike | null): void {
  testDb = d;
}

function realDb(idb: InkMirrorDb): DbLike {
  return {
    documents: {
      put: (row) => idb.put('documents', row),
      getAll: () => idb.getAll('documents'),
      get: (id) => idb.get('documents', id),
    },
    chapters: {
      put: (row) => idb.put('chapters', row),
      getAllByDocument: (documentId) =>
        idb.getAllFromIndex('chapters', 'by_document', documentId),
      delete: (id) => idb.delete('chapters', id),
    },
    blocks: {
      put: (row) => idb.put('blocks', row),
      getAllByDocument: (documentId) =>
        idb.getAllFromIndex('blocks', 'by_document', documentId),
      softDelete: async (id, deletedAt, deletedFrom) => {
        const tx = idb.transaction('blocks', 'readwrite');
        const store = tx.objectStore('blocks');
        const row = await store.get(id);
        if (row) {
          row.deleted_at = deletedAt;
          row.deleted_from = deletedFrom;
          row.updated_at = deletedAt;
          await store.put(row);
        }
        await tx.done;
      },
    },
    sentiments: {
      put: (row) => idb.put('sentiments', row),
      getAllByDocument: (documentId) =>
        idb.getAllFromIndex('sentiments', 'by_document', documentId),
    },
    characters: {
      put: (row) => idb.put('characters', row),
      getAllByDocument: (documentId) =>
        idb.getAllFromIndex('characters', 'by_document', documentId),
      delete: (id) => idb.delete('characters', id),
    },
    blockRevisions: {
      put: (row) => idb.put('block_revisions', row),
      getAllByBlock: (blockId) =>
        idb.getAllFromIndex('block_revisions', 'by_block', blockId),
      delete: (id) => idb.delete('block_revisions', id),
    },
    inconsistencies: {
      put: (row) => idb.put('inconsistencies', row),
      get: (id) => idb.get('inconsistencies', id),
      getAllByDocument: (documentId) =>
        idb.getAllFromIndex('inconsistencies', 'by_document', documentId),
      getAllByCharacter: (characterId) =>
        idb.getAllFromIndex('inconsistencies', 'by_character', characterId),
      getAllByBlock: async (blockId) => {
        // A flag references two blocks (A and B). Query both indexes and merge.
        const [aHits, bHits] = await Promise.all([
          idb.getAllFromIndex('inconsistencies', 'by_block_a', blockId),
          idb.getAllFromIndex('inconsistencies', 'by_block_b', blockId),
        ]);
        const seen = new Set<string>();
        const out: InconsistencyRow[] = [];
        for (const row of [...aHits, ...bHits]) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          out.push(row);
        }
        return out;
      },
      delete: (id) => idb.delete('inconsistencies', id),
    },
  };
}

export async function db(): Promise<DbLike> {
  if (testDb) return testDb;
  return realDb(await getDb());
}
