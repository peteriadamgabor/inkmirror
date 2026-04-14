import type { Block, Chapter, Document, UUID } from '@/types';
import { getDb } from './connection';
import { logDbError } from './errors';

interface BlockRow {
  id: string;
  document_id: string;
  chapter_id: string;
  type: string;
  content: string;
  order_idx: number;
  metadata: unknown;
  deleted_at: string | null;
  deleted_from: unknown | null;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  document_id: string;
  title: string;
  order_idx: number;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  settings: Document['settings'];
  created_at: string;
  updated_at: string;
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

export interface DbLike {
  query(sql: string, vars?: Record<string, unknown>): Promise<unknown>;
}

let testDb: DbLike | null = null;

export function __setTestDb(db: DbLike | null): void {
  testDb = db;
}

async function db(): Promise<DbLike> {
  if (testDb) return testDb;
  // The real Surreal client's query signature is compatible in usage —
  // it returns a thenable Query builder that awaits into the raw rows we expect.
  return (await getDb()) as unknown as DbLike;
}

function firstRow<T>(result: unknown): T[] {
  // Surreal .query returns an array of result sets (one per statement)
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (Array.isArray(first)) return first as T[];
  }
  return [];
}

export async function saveDocument(doc: Document): Promise<void> {
  try {
    const row: DocumentRow = {
      id: doc.id,
      title: doc.title,
      author: doc.author,
      synopsis: doc.synopsis,
      settings: doc.settings,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
    const d = await db();
    await d.query(`UPDATE type::thing('document', $id) CONTENT $row`, { id: row.id, row });
  } catch (err) {
    logDbError('repository.saveDocument', err);
    throw err;
  }
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  try {
    const row: ChapterRow = {
      id: chapter.id,
      document_id: chapter.document_id,
      title: chapter.title,
      order_idx: chapter.order,
      created_at: chapter.created_at,
      updated_at: chapter.updated_at,
    };
    const d = await db();
    await d.query(`UPDATE type::thing('chapter', $id) CONTENT $row`, { id: row.id, row });
  } catch (err) {
    logDbError('repository.saveChapter', err);
    throw err;
  }
}

export async function saveBlock(block: Block, documentId: UUID): Promise<void> {
  try {
    const row = blockToRow(block, documentId);
    const d = await db();
    await d.query(`UPDATE type::thing('block', $id) CONTENT $row`, { id: row.id, row });
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
    await d.query(
      `UPDATE type::thing('block', $id) SET deleted_at = $now, deleted_from = $df, updated_at = $now`,
      { id: blockId, now, df: deletedFrom },
    );
  } catch (err) {
    logDbError('repository.softDeleteBlock', err);
    throw err;
  }
}

export async function listDocuments(): Promise<Document[]> {
  try {
    const d = await db();
    const result = await d.query('SELECT * FROM document ORDER BY created_at ASC');
    const rows = firstRow<DocumentRow>(result);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      synopsis: r.synopsis,
      settings: r.settings,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  } catch (err) {
    logDbError('repository.listDocuments', err);
    throw err;
  }
}

export interface LoadedDocument {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
}

export async function loadDocument(documentId: UUID): Promise<LoadedDocument | null> {
  try {
    const d = await db();
    const docResult = await d.query(`SELECT * FROM document WHERE id = $id`, { id: documentId });
    const docRow = firstRow<DocumentRow>(docResult)[0];
    if (!docRow) return null;

    const chapResult = await d.query(
      `SELECT * FROM chapter WHERE document_id = $id ORDER BY order_idx ASC`,
      { id: documentId },
    );
    const chapters: Chapter[] = firstRow<ChapterRow>(chapResult).map((r) => ({
      id: r.id,
      document_id: r.document_id,
      title: r.title,
      order: r.order_idx,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const blockResult = await d.query(
      `SELECT * FROM block WHERE document_id = $id AND deleted_at IS NONE ORDER BY order_idx ASC`,
      { id: documentId },
    );
    const blocks = firstRow<BlockRow>(blockResult).map(rowToBlock);

    return {
      document: {
        id: docRow.id,
        title: docRow.title,
        author: docRow.author,
        synopsis: docRow.synopsis,
        settings: docRow.settings,
        created_at: docRow.created_at,
        updated_at: docRow.updated_at,
      },
      chapters,
      blocks,
    };
  } catch (err) {
    logDbError('repository.loadDocument', err);
    throw err;
  }
}
