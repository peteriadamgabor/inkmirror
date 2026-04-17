import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { InconsistencyFlag, InconsistencyStatus } from '@/types';
import { logDbError } from './errors';

export interface CharacterRow {
  id: string;
  document_id: string;
  name: string;
  aliases: string[];
  notes: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface BlockRevisionRow {
  id: string; // `${block_id}|${snapshot_at}` — ordered, unique
  block_id: string;
  document_id: string;
  content: string;
  snapshot_at: string;
}

export interface SentimentRow {
  block_id: string;
  document_id: string;
  label: string;
  score: number;
  content_hash: string;
  analyzed_at: string;
  /**
   * Which model produced this row.
   * - `'light'` (or absent) = legacy 3-class distilbert sentiment.
   * - `'deep'` = mDeBERTa zero-shot mood classification (Near tier).
   *
   * Absence is treated as `'light'` at read time; new rows always set it.
   */
  source?: 'light' | 'deep';
}

export type InconsistencyRow = InconsistencyFlag;

export interface BlockRow {
  id: string;
  document_id: string;
  chapter_id: string;
  type: string;
  content: string;
  marks?: unknown; // serialized Mark[] when present
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
  kind?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  settings: unknown;
  pov_character_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InkMirrorSchema extends DBSchema {
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
  sentiments: {
    key: string;
    value: SentimentRow;
    indexes: { by_document: string };
  };
  characters: {
    key: string;
    value: CharacterRow;
    indexes: { by_document: string };
  };
  block_revisions: {
    key: string;
    value: BlockRevisionRow;
    indexes: { by_block: string };
  };
  inconsistencies: {
    key: string;
    value: InconsistencyRow;
    indexes: {
      by_document: string;
      by_character: string;
      by_block_a: string;
      by_block_b: string;
      by_status: InconsistencyStatus;
    };
  };
}

const DB_NAME = 'inkmirror';
// v1: initial stores
// v2: idempotent upgrade after SurrealDB leftover
// v3: add `sentiments` store for Phase 3 slice 2
// v4: add `characters` store for Phase 3 slice 4
// v5: add `block_revisions` store for per-block history
// v6: add `inconsistencies` store for the Near tier
const DB_VERSION = 6;

export type InkMirrorDb = IDBPDatabase<InkMirrorSchema>;

let dbPromise: Promise<InkMirrorDb> | null = null;

export function getDb(): Promise<InkMirrorDb> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      return await openDB<InkMirrorSchema>(DB_NAME, DB_VERSION, {
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
          if (!db.objectStoreNames.contains('sentiments')) {
            const sentiments = db.createObjectStore('sentiments', { keyPath: 'block_id' });
            sentiments.createIndex('by_document', 'document_id');
          }
          if (!db.objectStoreNames.contains('characters')) {
            const characters = db.createObjectStore('characters', { keyPath: 'id' });
            characters.createIndex('by_document', 'document_id');
          }
          if (!db.objectStoreNames.contains('block_revisions')) {
            const revs = db.createObjectStore('block_revisions', { keyPath: 'id' });
            revs.createIndex('by_block', 'block_id');
          }
          if (!db.objectStoreNames.contains('inconsistencies')) {
            const inc = db.createObjectStore('inconsistencies', { keyPath: 'id' });
            inc.createIndex('by_document', 'document_id');
            inc.createIndex('by_character', 'character_id');
            inc.createIndex('by_block_a', 'block_a_id');
            inc.createIndex('by_block_b', 'block_b_id');
            inc.createIndex('by_status', 'status');
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
