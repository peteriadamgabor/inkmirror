import type { Block, Chapter, Character, Document } from '@/types';
import type {
  BlockRevisionRow,
  BlockRow,
  ChapterRow,
  CharacterRow,
  DocumentRow,
  SentimentRow,
} from '@/db/connection';
import type { SentimentEntry } from '@/db/repository';

export const DOC_BUNDLE_KIND = 'inkmirror.document';
export const DB_BACKUP_KIND = 'inkmirror.database';

export const DOC_BUNDLE_VERSION = 1;
export const DB_BACKUP_VERSION = 1;

/** Single-document bundle — move one book between browsers. */
export interface DocumentBundleV1 {
  kind: typeof DOC_BUNDLE_KIND;
  version: 1;
  exported_at: string;
  app_version: string;
  document: Document;
  chapters: Chapter[];
  /** Includes soft-deleted blocks so the graveyard travels with the book. */
  blocks: Block[];
  characters: Character[];
  sentiments: SentimentEntry[];
}

/** Full database dump — disaster recovery across every book. */
export interface DatabaseBackupV1 {
  kind: typeof DB_BACKUP_KIND;
  version: 1;
  exported_at: string;
  app_version: string;
  stores: {
    documents: DocumentRow[];
    chapters: ChapterRow[];
    blocks: BlockRow[];
    sentiments: SentimentRow[];
    characters: CharacterRow[];
    block_revisions: BlockRevisionRow[];
  };
}

export type AnyBundle = DocumentBundleV1 | DatabaseBackupV1;

export function isDocumentBundle(x: unknown): x is DocumentBundleV1 {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as { kind?: unknown }).kind === DOC_BUNDLE_KIND &&
    (x as { version?: unknown }).version === DOC_BUNDLE_VERSION
  );
}

export function isDatabaseBackup(x: unknown): x is DatabaseBackupV1 {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as { kind?: unknown }).kind === DB_BACKUP_KIND &&
    (x as { version?: unknown }).version === DB_BACKUP_VERSION
  );
}
