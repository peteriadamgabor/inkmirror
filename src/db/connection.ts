import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { logDbError } from './errors';

export interface BlockRow {
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

export interface ChapterRow {
  id: string;
  document_id: string;
  title: string;
  order_idx: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  settings: unknown;
  created_at: string;
  updated_at: string;
}

export interface StoryForgeSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentRow;
  };
  chapters: {
    key: string;
    value: ChapterRow;
    indexes: { by_document: string };
  };
  blocks: {
    key: string;
    value: BlockRow;
    indexes: { by_document: string; by_chapter: string };
  };
}

const DB_NAME = 'storyforge';
// Version 2: bumped from 1 to force the upgrade handler to run against any
// leftover DB created during the SurrealDB Wasm experiment (which left a
// same-named IDB with no object stores).
const DB_VERSION = 2;

export type StoryForgeDb = IDBPDatabase<StoryForgeSchema>;

let dbPromise: Promise<StoryForgeDb> | null = null;

export function getDb(): Promise<StoryForgeDb> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      return await openDB<StoryForgeSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Idempotent: create any store/index that doesn't already exist.
          if (!db.objectStoreNames.contains('documents')) {
            db.createObjectStore('documents', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('chapters')) {
            const chapters = db.createObjectStore('chapters', { keyPath: 'id' });
            chapters.createIndex('by_document', 'document_id');
          }
          if (!db.objectStoreNames.contains('blocks')) {
            const blocks = db.createObjectStore('blocks', { keyPath: 'id' });
            blocks.createIndex('by_document', 'document_id');
            blocks.createIndex('by_chapter', 'chapter_id');
          }
        },
      });
    } catch (err) {
      logDbError('connection.boot', err);
      throw err;
    }
  })();
  return dbPromise;
}

export function __resetDbForTests(): void {
  dbPromise = null;
}
