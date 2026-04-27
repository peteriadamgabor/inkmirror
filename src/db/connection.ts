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
  /**
   * Writer-authored description (one or two sentences). Optional because
   * rows persisted before this field existed are still valid; readers
   * treat `undefined` as an empty description.
   */
  description?: string;
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
  sync_enabled: boolean;
  last_sync_revision: number;
  last_synced_at: number | null;
}

export interface SyncKeysRow {
  id: 'singleton';
  syncId: string;
  salt: string;       // base64url, 16 bytes
  K_enc_b64: string;  // base64url, 32 bytes
  K_auth_b64: string; // base64url, 32 bytes
  createdAt: string;
}

export interface InkMirrorSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentRow;
  };
  sync_keys: {
    key: string;
    value: SyncKeysRow;
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
// v7: add `sync_keys` store + sync_enabled / last_sync_revision / last_synced_at on documents
const DB_VERSION = 7;

export type InkMirrorDb = IDBPDatabase<InkMirrorSchema>;

/**
 * Open an InkMirror database by name and run all schema migrations up to
 * `DB_VERSION`. Exposed with an optional `name` parameter so test suites
 * can open an isolated DB without touching the real `'inkmirror'` store.
 */
export async function connectDB(name = DB_NAME): Promise<InkMirrorDb> {
  return openDB<InkMirrorSchema>(name, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      // ── Idempotent store / index creation (all versions) ────────────
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

      // ── v7: sync_keys store + backfill document sync fields ─────────
      if (oldVersion < 7) {
        if (!db.objectStoreNames.contains('sync_keys')) {
          db.createObjectStore('sync_keys', { keyPath: 'id' });
        }
        // Backfill existing documents with the new sync fields.
        const docsStore = tx.objectStore('documents');
        let cursor = await docsStore.openCursor();
        while (cursor) {
          const row = cursor.value as unknown as Record<string, unknown>;
          if (row.sync_enabled === undefined)       row.sync_enabled = false;
          if (row.last_sync_revision === undefined) row.last_sync_revision = 0;
          if (row.last_synced_at === undefined)     row.last_synced_at = null;
          await cursor.update(row as unknown as DocumentRow);
          cursor = await cursor.continue();
        }
      }
    },
  });
}

let dbPromise: Promise<InkMirrorDb> | null = null;

export function getDb(): Promise<InkMirrorDb> {
  if (dbPromise) return dbPromise;
  dbPromise = connectDB(DB_NAME).catch((err) => {
    logDbError('connection.boot', err);
    throw err;
  });
  return dbPromise;
}

export function __resetDbForTests(): void {
  dbPromise = null;
}
