import type { UUID } from '@/types';
import { getDb } from '@/db/connection';
import { loadCharacters, loadSentiments } from '@/db/repository';
import {
  DB_BACKUP_KIND,
  DB_BACKUP_VERSION,
  DOC_BUNDLE_KIND,
  DOC_BUNDLE_VERSION,
  type DatabaseBackupV1,
  type DocumentBundleV1,
} from './format';
import { sanitizeFilename } from '@/exporters';

const APP_VERSION = '0.0.1';

/**
 * Build a single-document bundle. Includes soft-deleted blocks so
 * the graveyard rides along; omits block_revisions (undo history is
 * ephemeral and roughly 20× the block count in size).
 */
export async function exportDocumentBundle(documentId: UUID): Promise<DocumentBundleV1> {
  const db = await getDb();
  const docRow = await db.get('documents', documentId);
  if (!docRow) throw new Error(`Document ${documentId} not found`);

  const chapterRows = await db.getAllFromIndex('chapters', 'by_document', documentId);
  const blockRows = await db.getAllFromIndex('blocks', 'by_document', documentId);

  const chapters = chapterRows
    .sort((a, b) => a.order_idx - b.order_idx)
    .map((r) => ({
      id: r.id,
      document_id: r.document_id,
      title: r.title,
      order: r.order_idx,
      kind: (r.kind as import('@/types').ChapterKind | undefined) ?? 'standard',
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

  const blocks = blockRows
    .sort((a, b) => a.order_idx - b.order_idx)
    .map((r) => {
      const marks = Array.isArray(r.marks) ? r.marks : undefined;
      const b: import('@/types').Block = {
        id: r.id,
        chapter_id: r.chapter_id,
        type: r.type as import('@/types').BlockType,
        content: r.content,
        order: r.order_idx,
        metadata: r.metadata as import('@/types').BlockMetadata,
        deleted_at: r.deleted_at,
        deleted_from: r.deleted_from as import('@/types').Block['deleted_from'],
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
      if (marks && marks.length > 0) b.marks = marks as import('@/types').Mark[];
      return b;
    });

  const characters = await loadCharacters(documentId);
  const sentiments = await loadSentiments(documentId);

  return {
    kind: DOC_BUNDLE_KIND,
    version: DOC_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    document: {
      id: docRow.id,
      title: docRow.title,
      author: docRow.author,
      synopsis: docRow.synopsis,
      settings: docRow.settings as import('@/types').DocumentSettings,
      pov_character_id: docRow.pov_character_id ?? null,
      created_at: docRow.created_at,
      updated_at: docRow.updated_at,
    },
    chapters,
    blocks,
    characters,
    sentiments,
  };
}

/** Raw dump of every object store — the safety-net backup. */
export async function exportDatabaseBackup(): Promise<DatabaseBackupV1> {
  const db = await getDb();
  const [documents, chapters, blocks, sentiments, characters, block_revisions] =
    await Promise.all([
      db.getAll('documents'),
      db.getAll('chapters'),
      db.getAll('blocks'),
      db.getAll('sentiments'),
      db.getAll('characters'),
      db.getAll('block_revisions'),
    ]);

  return {
    kind: DB_BACKUP_KIND,
    version: DB_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    stores: { documents, chapters, blocks, sentiments, characters, block_revisions },
  };
}

export function bundleToBlob(bundle: unknown): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
}

export function documentBundleFilename(docTitle: string, exportedAt: string): string {
  const dateStamp = exportedAt.slice(0, 10);
  const base = sanitizeFilename(docTitle) || 'untitled';
  return `${base}-${dateStamp}.inkmirror.json`;
}

export function databaseBackupFilename(exportedAt: string): string {
  const dateStamp = exportedAt.slice(0, 19).replace('T', '-').replace(/:/g, '');
  return `inkmirror-backup-${dateStamp}.inkmirror.backup.json`;
}
