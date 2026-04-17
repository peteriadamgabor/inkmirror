import type {
  Block,
  Chapter,
  Character,
  Document,
  InconsistencyFlag,
  InconsistencyStatus,
  UUID,
} from '@/types';
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
import { logDbError } from './errors';

export interface BlockRevision {
  blockId: UUID;
  documentId: UUID;
  content: string;
  snapshotAt: string;
}

const REVISION_CAP = 20;

function revisionId(blockId: UUID, snapshotAt: string): string {
  return `${blockId}|${snapshotAt}`;
}

export interface SentimentEntry {
  blockId: UUID;
  label: string;
  score: number;
  contentHash: string;
  analyzedAt: string;
  source?: 'light' | 'deep';
}

function blockToRow(b: Block, documentId: UUID): BlockRow {
  return {
    id: b.id,
    document_id: documentId,
    chapter_id: b.chapter_id,
    type: b.type,
    content: b.content,
    marks: b.marks,
    order_idx: b.order,
    metadata: b.metadata,
    deleted_at: b.deleted_at,
    deleted_from: b.deleted_from,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

function rowToBlock(row: BlockRow): Block {
  const marks = Array.isArray(row.marks) ? (row.marks as Block['marks']) : undefined;
  const block: Block = {
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
  if (marks && marks.length > 0) block.marks = marks;
  return block;
}

function chapterToRow(c: Chapter): ChapterRow {
  return {
    id: c.id,
    document_id: c.document_id,
    title: c.title,
    order_idx: c.order,
    kind: c.kind,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function characterToRow(c: Character): CharacterRow {
  return {
    id: c.id,
    document_id: c.document_id,
    name: c.name,
    aliases: c.aliases,
    notes: c.notes,
    color: c.color,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function rowToCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    document_id: r.document_id,
    name: r.name,
    aliases: r.aliases,
    notes: r.notes,
    color: r.color,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    document_id: r.document_id,
    title: r.title,
    order: r.order_idx,
    // Legacy rows (written before ChapterKind existed) default to standard.
    kind: (r.kind as Chapter['kind'] | undefined) ?? 'standard',
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
    pov_character_id: d.pov_character_id,
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
    // Legacy rows (written before POV existed) read as null.
    pov_character_id: r.pov_character_id ?? null,
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

export function __setTestDb(db: DbLike | null): void {
  testDb = db;
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

export async function deleteChapterRow(id: UUID): Promise<void> {
  try {
    const d = await db();
    await d.chapters.delete(id);
  } catch (err) {
    logDbError('repository.deleteChapterRow', err);
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

export async function saveRevision(entry: BlockRevision): Promise<void> {
  try {
    const d = await db();
    const existing = await d.blockRevisions.getAllByBlock(entry.blockId);
    // Dedup: if the latest revision has identical content, skip the write.
    if (existing.length > 0) {
      existing.sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at));
      const last = existing[existing.length - 1];
      if (last.content === entry.content) return;
    }
    const row: BlockRevisionRow = {
      id: revisionId(entry.blockId, entry.snapshotAt),
      block_id: entry.blockId,
      document_id: entry.documentId,
      content: entry.content,
      snapshot_at: entry.snapshotAt,
    };
    await d.blockRevisions.put(row);
    // Trim: keep only the most recent REVISION_CAP entries.
    const all = [...existing, row].sort((a, b) =>
      a.snapshot_at.localeCompare(b.snapshot_at),
    );
    const excess = all.length - REVISION_CAP;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        await d.blockRevisions.delete(all[i].id);
      }
    }
  } catch (err) {
    logDbError('repository.saveRevision', err);
    throw err;
  }
}

export async function loadRevisions(blockId: UUID): Promise<BlockRevision[]> {
  try {
    const d = await db();
    const rows = await d.blockRevisions.getAllByBlock(blockId);
    rows.sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at));
    return rows.map((r) => ({
      blockId: r.block_id,
      documentId: r.document_id,
      content: r.content,
      snapshotAt: r.snapshot_at,
    }));
  } catch (err) {
    logDbError('repository.loadRevisions', err);
    throw err;
  }
}

export async function loadDeletedBlocks(documentId: UUID): Promise<Block[]> {
  try {
    const d = await db();
    const rows = await d.blocks.getAllByDocument(documentId);
    return rows
      .filter((r) => r.deleted_at !== null)
      .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''))
      .map(rowToBlock);
  } catch (err) {
    logDbError('repository.loadDeletedBlocks', err);
    throw err;
  }
}

export async function restoreBlock(
  blockId: UUID,
  documentId: UUID,
): Promise<Block | null> {
  try {
    const d = await db();
    const rows = await d.blocks.getAllByDocument(documentId);
    const row = rows.find((r) => r.id === blockId);
    if (!row || row.deleted_at === null) return null;
    const now = new Date().toISOString();
    const restored: BlockRow = {
      ...row,
      deleted_at: null,
      deleted_from: null,
      updated_at: now,
    };
    await d.blocks.put(restored);
    return rowToBlock(restored);
  } catch (err) {
    logDbError('repository.restoreBlock', err);
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
      source: entry.source,
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
      source: r.source ?? 'light',
    }));
  } catch (err) {
    logDbError('repository.loadSentiments', err);
    throw err;
  }
}

// ---------- inconsistency flags ----------

export async function saveInconsistencyFlag(flag: InconsistencyFlag): Promise<void> {
  try {
    const d = await db();
    await d.inconsistencies.put(flag);
  } catch (err) {
    logDbError('repository.saveInconsistencyFlag', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByDocument(
  documentId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByDocument(documentId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByDocument', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByCharacter(
  characterId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByCharacter(characterId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByCharacter', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByBlock(
  blockId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByBlock(blockId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByBlock', err);
    throw err;
  }
}

export async function deleteInconsistencyFlag(id: string): Promise<void> {
  try {
    const d = await db();
    await d.inconsistencies.delete(id);
  } catch (err) {
    logDbError('repository.deleteInconsistencyFlag', err);
    throw err;
  }
}

export async function setInconsistencyFlagStatus(
  id: string,
  status: InconsistencyStatus,
): Promise<void> {
  try {
    const d = await db();
    const existing = await d.inconsistencies.get(id);
    if (!existing) return;
    existing.status = status;
    existing.dismissed_at = status === 'dismissed' ? Date.now() : null;
    await d.inconsistencies.put(existing);
  } catch (err) {
    logDbError('repository.setInconsistencyFlagStatus', err);
    throw err;
  }
}

export async function saveCharacter(character: Character): Promise<void> {
  try {
    const d = await db();
    await d.characters.put(characterToRow(character));
  } catch (err) {
    logDbError('repository.saveCharacter', err);
    throw err;
  }
}

export async function deleteCharacter(id: UUID): Promise<void> {
  try {
    const d = await db();
    await d.characters.delete(id);
  } catch (err) {
    logDbError('repository.deleteCharacter', err);
    throw err;
  }
}

export async function loadCharacters(documentId: UUID): Promise<Character[]> {
  try {
    const d = await db();
    const rows = await d.characters.getAllByDocument(documentId);
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows.map(rowToCharacter);
  } catch (err) {
    logDbError('repository.loadCharacters', err);
    throw err;
  }
}

export interface LoadedDocument {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
  sentiments: SentimentEntry[];
  characters: Character[];
  inconsistencyFlags: InconsistencyFlag[];
}

/**
 * Delete every row belonging to a document across every object store,
 * including block_revisions. Used by both the DocumentPicker delete
 * flow and the replace-strategy import wipe so they stay consistent.
 *
 * NOTE: bypasses the DbLike test-injection layer because it spans
 * stores; test setup must use the real fake-indexeddb.
 */
export async function deleteDocumentAllRows(documentId: UUID): Promise<void> {
  try {
    const idb = await getDb();
    const chapters = await idb.getAllFromIndex('chapters', 'by_document', documentId);
    const blocks = await idb.getAllFromIndex('blocks', 'by_document', documentId);
    const sentiments = await idb.getAllFromIndex('sentiments', 'by_document', documentId);
    const characters = await idb.getAllFromIndex('characters', 'by_document', documentId);
    for (const c of chapters) await idb.delete('chapters', c.id);
    for (const b of blocks) {
      const revs = await idb.getAllFromIndex('block_revisions', 'by_block', b.id);
      for (const r of revs) await idb.delete('block_revisions', r.id);
      await idb.delete('blocks', b.id);
    }
    for (const s of sentiments) await idb.delete('sentiments', s.block_id);
    for (const c of characters) await idb.delete('characters', c.id);
    await idb.delete('documents', documentId);
  } catch (err) {
    logDbError('repository.deleteDocumentAllRows', err);
    throw err;
  }
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
    const characters = await loadCharacters(documentId);
    const inconsistencyFlags = await loadInconsistencyFlagsByDocument(documentId);

    return {
      document: rowToDocument(docRow),
      chapters: chapterRows.map(rowToChapter),
      blocks: visibleBlocks.map(rowToBlock),
      sentiments,
      characters,
      inconsistencyFlags,
    };
  } catch (err) {
    logDbError('repository.loadDocument', err);
    throw err;
  }
}
