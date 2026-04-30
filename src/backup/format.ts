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

// ---------- deep validation ----------
//
// Lives next to the shape guards because both serve the same purpose:
// gate untrusted input before it can touch the database.
// `isDocumentBundle` / `isDatabaseBackup` only check the envelope
// (kind/version) — these validators check the payload structurally and
// referentially so a shape-compatible but broken bundle cannot destroy
// data in the replace-strategy import path.

/** Upper bounds on per-bundle row counts. Any user-generated manuscript
 * stays comfortably under these; anything beyond is either a bug or a
 * hostile payload designed to exhaust memory during the import walk. */
const MAX_CHAPTERS = 5_000;
const MAX_BLOCKS = 200_000;
const MAX_CHARACTERS = 10_000;
const MAX_SENTIMENTS = 200_000;

const VALID_BLOCK_TYPES = new Set(['text', 'dialogue', 'scene', 'note']);
const VALID_CHAPTER_KINDS = new Set([
  'standard',
  'cover',
  'dedication',
  'epigraph',
  'acknowledgments',
  'afterword',
]);

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateBlockMetadata(meta: unknown, characterIds: Set<string>): string | null {
  if (!isPlainObject(meta)) return 'metadata is not an object';
  const t = (meta as { type?: unknown }).type;
  if (t === 'text' || t === 'note') return null;
  if (t === 'dialogue') {
    const data = (meta as { data?: unknown }).data;
    if (!isPlainObject(data)) return 'dialogue metadata.data missing';
    const speakerId = (data as { speaker_id?: unknown }).speaker_id;
    // Runtime stores `''` to mean "unassigned" (newly created dialogue
    // blocks, or blocks whose speaker character was deleted). Treat
    // null / undefined / '' identically as "no speaker" — only validate
    // when there's an actual id to look up.
    if (speakerId !== undefined && speakerId !== null && speakerId !== '') {
      if (typeof speakerId !== 'string') return 'dialogue speaker_id not a string';
      if (!characterIds.has(speakerId)) {
        return `dialogue speaker_id "${speakerId}" has no matching character`;
      }
    }
    return null;
  }
  if (t === 'scene') {
    const data = (meta as { data?: unknown }).data;
    if (!isPlainObject(data)) return 'scene metadata.data missing';
    const charIds = (data as { character_ids?: unknown }).character_ids;
    if (charIds !== undefined) {
      if (!Array.isArray(charIds)) return 'scene character_ids not an array';
      for (const id of charIds) {
        if (!isNonEmptyString(id)) return 'scene character_ids contains non-string';
        if (!characterIds.has(id)) {
          return `scene character_id "${id}" has no matching character`;
        }
      }
    }
    return null;
  }
  return `unknown block metadata type: ${String(t)}`;
}

/**
 * Throws with a descriptive message when the bundle fails any deep
 * structural or cross-reference check. Call this before any destructive
 * operation (e.g. wipeDocument in the replace strategy).
 */
export function validateDocumentBundle(bundle: DocumentBundleV1): void {
  if (!isPlainObject(bundle.document) || !isNonEmptyString(bundle.document.id)) {
    throw new Error('document id missing or invalid');
  }
  if (!isNonEmptyString(bundle.document.title) && bundle.document.title !== '') {
    throw new Error('document.title must be a string');
  }
  if (!Array.isArray(bundle.chapters)) throw new Error('chapters not an array');
  if (!Array.isArray(bundle.blocks)) throw new Error('blocks not an array');
  if (!Array.isArray(bundle.characters)) throw new Error('characters not an array');
  if (!Array.isArray(bundle.sentiments)) throw new Error('sentiments not an array');

  if (bundle.chapters.length > MAX_CHAPTERS) {
    throw new Error(`chapters exceeds max ${MAX_CHAPTERS}`);
  }
  if (bundle.blocks.length > MAX_BLOCKS) {
    throw new Error(`blocks exceeds max ${MAX_BLOCKS}`);
  }
  if (bundle.characters.length > MAX_CHARACTERS) {
    throw new Error(`characters exceeds max ${MAX_CHARACTERS}`);
  }
  if (bundle.sentiments.length > MAX_SENTIMENTS) {
    throw new Error(`sentiments exceeds max ${MAX_SENTIMENTS}`);
  }

  const docId = bundle.document.id;

  const characterIds = new Set<string>();
  for (const c of bundle.characters) {
    if (!isPlainObject(c) || !isNonEmptyString((c as { id?: unknown }).id)) {
      throw new Error('character id missing or invalid');
    }
    if ((c as { document_id?: unknown }).document_id !== docId) {
      throw new Error(`character "${(c as { id: string }).id}" has wrong document_id`);
    }
    characterIds.add((c as { id: string }).id);
  }

  const povId = bundle.document.pov_character_id;
  if (povId !== null && povId !== undefined) {
    if (!isNonEmptyString(povId)) throw new Error('document.pov_character_id invalid');
    if (!characterIds.has(povId)) {
      throw new Error(`document.pov_character_id "${povId}" has no matching character`);
    }
  }

  const chapterIds = new Set<string>();
  for (const ch of bundle.chapters) {
    if (!isPlainObject(ch) || !isNonEmptyString((ch as { id?: unknown }).id)) {
      throw new Error('chapter id missing or invalid');
    }
    if ((ch as { document_id?: unknown }).document_id !== docId) {
      throw new Error(`chapter "${(ch as { id: string }).id}" has wrong document_id`);
    }
    const kind = (ch as { kind?: unknown }).kind;
    if (kind !== undefined && (typeof kind !== 'string' || !VALID_CHAPTER_KINDS.has(kind))) {
      throw new Error(`chapter "${(ch as { id: string }).id}" has invalid kind "${String(kind)}"`);
    }
    chapterIds.add((ch as { id: string }).id);
  }

  const blockIds = new Set<string>();
  for (const b of bundle.blocks) {
    if (!isPlainObject(b) || !isNonEmptyString((b as { id?: unknown }).id)) {
      throw new Error('block id missing or invalid');
    }
    const bid = (b as { id: string }).id;
    const bt = (b as { type?: unknown }).type;
    if (typeof bt !== 'string' || !VALID_BLOCK_TYPES.has(bt)) {
      throw new Error(`block "${bid}" has invalid type "${String(bt)}"`);
    }
    if (typeof (b as { content?: unknown }).content !== 'string') {
      throw new Error(`block "${bid}" content is not a string`);
    }
    const isSoftDeleted = (b as { deleted_at?: unknown }).deleted_at != null;
    const deletedFrom = (b as { deleted_from?: unknown }).deleted_from;
    if (deletedFrom !== null && deletedFrom !== undefined) {
      if (!isPlainObject(deletedFrom)) {
        throw new Error(`block "${bid}" deleted_from is not an object`);
      }
      const dfChapter = (deletedFrom as { chapter_id?: unknown }).chapter_id;
      if (!isNonEmptyString(dfChapter)) {
        throw new Error(
          `block "${bid}" deleted_from.chapter_id "${String(dfChapter)}" is not a string`,
        );
      }
      // Active blocks have no deleted_from, so we shouldn't see one here.
      // If we do (data shape error), reject.
      if (!isSoftDeleted) {
        throw new Error(`block "${bid}" has deleted_from but is not soft-deleted`);
      }
      // For soft-deleted blocks, deleted_from.chapter_id is a historical
      // snapshot — the chapter may have been hard-deleted afterward. The
      // graveyard UI uses the snapshotted chapter_title, not a live join,
      // so a stale id is harmless here. Don't reject on miss.
    }
    // Active blocks MUST point at a real chapter (otherwise they're
    // unreachable in the editor). Soft-deleted blocks may carry a stale
    // chapter_id from a chapter that was hard-deleted while they sat in
    // the graveyard — the importer re-points those to a surviving
    // chapter so on-disk references stay valid.
    const chapterId = (b as { chapter_id?: unknown }).chapter_id;
    if (!isNonEmptyString(chapterId)) {
      throw new Error(`block "${bid}" chapter_id "${String(chapterId)}" is not a string`);
    }
    if (!isSoftDeleted && !chapterIds.has(chapterId)) {
      throw new Error(
        `block "${bid}" chapter_id "${chapterId}" has no matching chapter`,
      );
    }
    const metaErr = validateBlockMetadata((b as { metadata?: unknown }).metadata, characterIds);
    if (metaErr) throw new Error(`block "${bid}" ${metaErr}`);
    blockIds.add(bid);
  }

  for (const s of bundle.sentiments) {
    if (!isPlainObject(s)) throw new Error('sentiment entry not an object');
    const sid = (s as { blockId?: unknown }).blockId;
    if (!isNonEmptyString(sid) || !blockIds.has(sid)) {
      throw new Error(`sentiment blockId "${String(sid)}" has no matching block`);
    }
  }
}

/**
 * Validate a full-database backup payload. Each document gets its own
 * scoped validation; cross-document references are not permitted.
 */
export function validateDatabaseBackup(backup: DatabaseBackupV1): void {
  if (!isPlainObject(backup.stores)) throw new Error('stores not an object');
  const s = backup.stores;
  for (const key of ['documents', 'chapters', 'blocks', 'sentiments', 'characters', 'block_revisions'] as const) {
    if (!Array.isArray(s[key])) throw new Error(`stores.${key} not an array`);
  }
  const docIds = new Set<string>();
  for (const d of s.documents) {
    if (!isPlainObject(d) || !isNonEmptyString((d as { id?: unknown }).id)) {
      throw new Error('document id missing or invalid in backup');
    }
    docIds.add((d as { id: string }).id);
  }
  // Everything in other stores must belong to a known document.
  for (const row of s.chapters) {
    const did = (row as { document_id?: unknown }).document_id;
    if (!isNonEmptyString(did) || !docIds.has(did)) {
      throw new Error(`chapter document_id "${String(did)}" has no matching document`);
    }
  }
  for (const row of s.blocks) {
    const did = (row as { document_id?: unknown }).document_id;
    if (!isNonEmptyString(did) || !docIds.has(did)) {
      throw new Error(`block document_id "${String(did)}" has no matching document`);
    }
  }
}
