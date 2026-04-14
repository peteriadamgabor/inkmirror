import type { Block, Chapter, Document, UUID } from '@/types';
import {
  getDb,
  type BlockRow,
  type ChapterRow,
  type DocumentRow,
  type SentimentRow,
  type StoryForgeDb,
} from './connection';
import { logDbError } from './errors';

export interface SentimentEntry {
  blockId: UUID;
  label: string;
  score: number;
  contentHash: string;
  analyzedAt: string;
}

function blockToRow(b: Block, documentId: UUID): BlockRow {
  return {
    id: b.id,
    document_id: documentId,
    chapter_id: b.chapter_id,
    type: b.type,
    content: b.content,
    order_idx: b.order,
    metadata: b.metadata,
    deleted_at: b.deleted_at,
    deleted_from: b.deleted_from,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    chapter_id: row.chapter_id,
    type: row.type as Block['type'],
    content: row.content,
    order: row.order_idx,
    metadata: row.metadata as Block['metadata'],
    deleted_at: row.deleted_at,
    deleted_from: row.deleted_from as Block['deleted_from'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function chapterToRow(c: Chapter): ChapterRow {
  return {
    id: c.id,
    document_id: c.document_id,
    title: c.title,
    order_idx: c.order,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function rowToChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    document_id: r.document_id,
    title: r.title,
    order: r.order_idx,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function documentToRow(d: Document): DocumentRow {
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    synopsis: d.synopsis,
    settings: d.settings,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

function rowToDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    synopsis: r.synopsis,
    settings: r.settings as Document['settings'],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------- dependency injection for tests ----------

export interface DbLike {
  documents: {
    put(row: DocumentRow): Promise<unknown>;
    getAll(): Promise<DocumentRow[]>;
    get(id: string): Promise<DocumentRow | undefined>;
  };
  chapters: {
    put(row: ChapterRow): Promise<unknown>;
    getAllByDocument(documentId: string): Promise<ChapterRow[]>;
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
}

let testDb: DbLike | null = null;

export function __setTestDb(db: DbLike | null): void {
  testDb = db;
}

function realDb(idb: StoryForgeDb): DbLike {
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
  };
}

async function db(): Promise<DbLike> {
  if (testDb) return testDb;
  return realDb(await getDb());
}

// ---------- public API ----------

export async function saveDocument(doc: Document): Promise<void> {
  try {
    const d = await db();
    await d.documents.put(documentToRow(doc));
  } catch (err) {
    logDbError('repository.saveDocument', err);
    throw err;
  }
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  try {
    const d = await db();
    await d.chapters.put(chapterToRow(chapter));
  } catch (err) {
    logDbError('repository.saveChapter', err);
    throw err;
  }
}

export async function saveBlock(block: Block, documentId: UUID): Promise<void> {
  try {
    const d = await db();
    await d.blocks.put(blockToRow(block, documentId));
  } catch (err) {
    logDbError('repository.saveBlock', err);
    throw err;
  }
}

export async function softDeleteBlock(
  blockId: UUID,
  deletedFrom: NonNullable<Block['deleted_from']>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const d = await db();
    await d.blocks.softDelete(blockId, now, deletedFrom);
  } catch (err) {
    logDbError('repository.softDeleteBlock', err);
    throw err;
  }
}

export async function listDocuments(): Promise<Document[]> {
  try {
    const d = await db();
    const rows = await d.documents.getAll();
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows.map(rowToDocument);
  } catch (err) {
    logDbError('repository.listDocuments', err);
    throw err;
  }
}

export async function saveSentiment(
  documentId: UUID,
  entry: SentimentEntry,
): Promise<void> {
  try {
    const row: SentimentRow = {
      block_id: entry.blockId,
      document_id: documentId,
      label: entry.label,
      score: entry.score,
      content_hash: entry.contentHash,
      analyzed_at: entry.analyzedAt,
    };
    const d = await db();
    await d.sentiments.put(row);
  } catch (err) {
    logDbError('repository.saveSentiment', err);
    throw err;
  }
}

export async function loadSentiments(documentId: UUID): Promise<SentimentEntry[]> {
  try {
    const d = await db();
    const rows = await d.sentiments.getAllByDocument(documentId);
    return rows.map((r) => ({
      blockId: r.block_id,
      label: r.label,
      score: r.score,
      contentHash: r.content_hash,
      analyzedAt: r.analyzed_at,
    }));
  } catch (err) {
    logDbError('repository.loadSentiments', err);
    throw err;
  }
}

export interface LoadedDocument {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
  sentiments: SentimentEntry[];
}

export async function loadDocument(documentId: UUID): Promise<LoadedDocument | null> {
  try {
    const d = await db();
    const docRow = await d.documents.get(documentId);
    if (!docRow) return null;

    const chapterRows = await d.chapters.getAllByDocument(documentId);
    chapterRows.sort((a, b) => a.order_idx - b.order_idx);

    const blockRows = await d.blocks.getAllByDocument(documentId);
    const visibleBlocks = blockRows
      .filter((r) => r.deleted_at === null)
      .sort((a, b) => a.order_idx - b.order_idx);

    const sentiments = await loadSentiments(documentId);

    return {
      document: rowToDocument(docRow),
      chapters: chapterRows.map(rowToChapter),
      blocks: visibleBlocks.map(rowToBlock),
      sentiments,
    };
  } catch (err) {
    logDbError('repository.loadDocument', err);
    throw err;
  }
}
