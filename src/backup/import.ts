import type { Block, Chapter, Character, Document, UUID } from '@/types';
import { getDb, type BlockRevisionRow, type InkMirrorDb } from '@/db/connection';
import {
  deleteDocumentAllRows,
  disambiguateTitle,
  saveBlock,
  saveChapter,
  saveCharacter,
  saveDocument,
  saveSentiment,
} from '@/db/repository';
import {
  isDatabaseBackup,
  isDocumentBundle,
  validateDatabaseBackup,
  validateDocumentBundle,
  type DatabaseBackupV1,
  type DocumentBundleV1,
} from './format';

export interface ImportResult {
  kind: 'document' | 'database';
  documentsAdded: number;
  documentsSkipped: number;
  /** Only set for document imports when strategy='replace'. */
  replaced?: boolean;
  documentTitles: string[];
}

/**
 * How to handle a single-document import when a document with the
 * same id already exists locally:
 * - 'copy' — remap every id to fresh UUIDs; imported doc becomes a
 *   sibling. Title gets "(imported)" suffix. Original untouched.
 * - 'replace' — wipe the existing doc's rows (in all stores) and
 *   import the bundle under its original ids. Destructive.
 */
export type CollisionStrategy = 'copy' | 'replace';

/** Hard cap on bundle file size. ~50 MB is well above any realistic
 * single-book payload — `.inkmirror.json` for a 500-page novel is
 * typically <10 MB even with graveyard + sentiments. Rejecting larger
 * files protects the tab from JSON.parse OOM on hostile input. */
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

async function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof (blob as Blob & { text?: () => Promise<string> }).text === 'function') {
    return (blob as Blob & { text: () => Promise<string> }).text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export async function parseBundle(
  file: File,
): Promise<DocumentBundleV1 | DatabaseBackupV1> {
  if (file.size > MAX_BUNDLE_BYTES) {
    throw new Error(
      `Bundle too large (${(file.size / 1024 / 1024).toFixed(1)} MB); max ${MAX_BUNDLE_BYTES / 1024 / 1024} MB.`,
    );
  }
  const text = await readBlobAsText(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (isDocumentBundle(parsed)) return parsed;
  if (isDatabaseBackup(parsed)) return parsed;
  const kind = (parsed as { kind?: unknown })?.kind;
  const version = (parsed as { version?: unknown })?.version;
  throw new Error(
    `Not an InkMirror backup (kind="${String(kind)}", version=${String(version)}).`,
  );
}


/**
 * Import a single-document bundle.
 *
 * When no document with the bundle's id exists locally, the bundle is
 * imported as-is. When one exists, behavior depends on `strategy`:
 * - 'copy' (default): remap every id to fresh UUIDs and suffix the
 *   title with "(imported)" — both docs coexist.
 * - 'replace': wipe the existing doc's rows (chapters, blocks,
 *   sentiments, characters, revisions) and import the bundle under
 *   its original ids.
 */
export async function importDocumentBundle(
  bundle: DocumentBundleV1,
  strategy: CollisionStrategy = 'copy',
): Promise<ImportResult> {
  // Validate deeply BEFORE any destructive action. Shape-compatible
  // but structurally broken bundles must not wipe the existing doc.
  validateDocumentBundle(bundle);

  const db = await getDb();
  const existing = await db.get('documents', bundle.document.id);
  const collides = !!existing;

  if (collides && strategy === 'replace') {
    await deleteDocumentAllRows(bundle.document.id);
  }

  const remap = collides && strategy === 'copy';

  // Build an id-map; identity when we're not remapping.
  const chapterIdMap = new Map<UUID, UUID>();
  const blockIdMap = new Map<UUID, UUID>();
  const characterIdMap = new Map<UUID, UUID>();
  const newDocId: UUID = remap ? crypto.randomUUID() : bundle.document.id;

  for (const c of bundle.chapters) {
    chapterIdMap.set(c.id, remap ? crypto.randomUUID() : c.id);
  }
  for (const b of bundle.blocks) {
    blockIdMap.set(b.id, remap ? crypto.randomUUID() : b.id);
  }
  for (const ch of bundle.characters) {
    characterIdMap.set(ch.id, remap ? crypto.randomUUID() : ch.id);
  }

  const mapId = (m: Map<UUID, UUID>, id: UUID): UUID => m.get(id) ?? id;

  // Title resolution:
  //   - replace: keep the bundle's title as-is (we just deleted the prior doc with the same id).
  //   - copy (id-collision): suffix "(imported)" then disambiguate further if that's also taken.
  //   - new (no id collision): disambiguate against the existing library so we
  //     never silently land two distinct docs sharing a title.
  let resolvedTitle: string;
  if (remap) {
    resolvedTitle = await disambiguateTitle(
      `${bundle.document.title || 'Untitled'} (imported)`,
    );
  } else if (collides && strategy === 'replace') {
    resolvedTitle = bundle.document.title;
  } else {
    resolvedTitle = await disambiguateTitle(bundle.document.title || 'Untitled');
  }

  const importedDoc: Document = {
    ...bundle.document,
    id: newDocId,
    title: resolvedTitle,
    pov_character_id: bundle.document.pov_character_id
      ? mapId(characterIdMap, bundle.document.pov_character_id)
      : null,
    updated_at: new Date().toISOString(),
  };
  await saveDocument(importedDoc);

  for (const ch of bundle.chapters) {
    const imported: Chapter = {
      ...ch,
      id: mapId(chapterIdMap, ch.id),
      document_id: newDocId,
    };
    await saveChapter(imported);
  }

  for (const c of bundle.characters) {
    const imported: Character = {
      ...c,
      id: mapId(characterIdMap, c.id),
      document_id: newDocId,
    };
    await saveCharacter(imported);
  }

  // Soft-deleted blocks may carry a stale live `chapter_id` (or even a
  // stale `deleted_from.chapter_id`) when their original chapter was
  // hard-deleted while they sat in the graveyard. Pick a surviving
  // chapter as the universal fallback so no on-disk reference dangles.
  const fallbackChapterId: UUID | null =
    bundle.chapters.length > 0
      ? mapId(chapterIdMap, bundle.chapters[0].id)
      : null;

  for (const b of bundle.blocks) {
    const deletedFromRaw = b.deleted_from;
    const deletedFrom = deletedFromRaw
      ? {
          ...deletedFromRaw,
          chapter_id: chapterIdMap.has(deletedFromRaw.chapter_id)
            ? mapId(chapterIdMap, deletedFromRaw.chapter_id)
            : (fallbackChapterId ?? deletedFromRaw.chapter_id),
        }
      : null;

    // Remap speaker_id / character_ids inside metadata where present.
    let metadata = b.metadata;
    if (metadata.type === 'dialogue' && metadata.data?.speaker_id) {
      metadata = {
        ...metadata,
        data: {
          ...metadata.data,
          speaker_id: mapId(characterIdMap, metadata.data.speaker_id),
        },
      };
    } else if (metadata.type === 'scene' && Array.isArray(metadata.data?.character_ids)) {
      metadata = {
        ...metadata,
        data: {
          ...metadata.data,
          character_ids: metadata.data.character_ids.map((id) =>
            mapId(characterIdMap, id),
          ),
        },
      };
    }

    // Resolve the live chapter_id: prefer the original (mapped), then
    // deleted_from, then any surviving chapter. Active blocks always hit
    // the first branch — the validator already required it.
    let liveChapterTarget: UUID;
    if (chapterIdMap.has(b.chapter_id)) {
      liveChapterTarget = mapId(chapterIdMap, b.chapter_id);
    } else if (
      deletedFromRaw &&
      chapterIdMap.has(deletedFromRaw.chapter_id)
    ) {
      liveChapterTarget = mapId(chapterIdMap, deletedFromRaw.chapter_id);
    } else if (fallbackChapterId) {
      liveChapterTarget = fallbackChapterId;
    } else {
      // Bundle has zero chapters — only possible for a soft-deleted
      // block in a degenerate/empty doc. Keep the original id; nothing
      // sane references it anyway.
      liveChapterTarget = b.chapter_id;
    }

    const imported: Block = {
      ...b,
      id: mapId(blockIdMap, b.id),
      chapter_id: liveChapterTarget,
      deleted_from: deletedFrom,
      metadata,
    };
    await saveBlock(imported, newDocId);
  }

  for (const s of bundle.sentiments) {
    const remappedBlockId = mapId(blockIdMap, s.blockId);
    await saveSentiment(newDocId, { ...s, blockId: remappedBlockId });
  }

  return {
    kind: 'document',
    documentsAdded: 1,
    documentsSkipped: 0,
    replaced: collides && strategy === 'replace',
    documentTitles: [importedDoc.title],
  };
}

/**
 * Restore a full database backup. Skip-if-exists semantics: any
 * document already present (by id) is left alone. Everything else
 * is merged in. This is the safe default — user can manually delete
 * existing docs first if they want a clean replacement.
 */
export async function importDatabaseBackup(
  backup: DatabaseBackupV1,
): Promise<ImportResult> {
  validateDatabaseBackup(backup);
  const db: InkMirrorDb = await getDb();
  const existingDocIds = new Set(
    (await db.getAll('documents')).map((d) => d.id),
  );

  const importableDocIds = new Set<string>();
  let added = 0;
  let skipped = 0;
  const addedTitles: string[] = [];

  for (const d of backup.stores.documents) {
    if (existingDocIds.has(d.id)) {
      skipped++;
      continue;
    }
    importableDocIds.add(d.id);
    added++;
    addedTitles.push(d.title || 'Untitled');
    await db.put('documents', d);
  }

  const within = (docId: string | undefined | null) =>
    !!docId && importableDocIds.has(docId);

  for (const row of backup.stores.chapters) {
    if (within(row.document_id)) await db.put('chapters', row);
  }
  for (const row of backup.stores.blocks) {
    if (within(row.document_id)) await db.put('blocks', row);
  }
  for (const row of backup.stores.sentiments) {
    if (within(row.document_id)) await db.put('sentiments', row);
  }
  for (const row of backup.stores.characters) {
    if (within(row.document_id)) await db.put('characters', row);
  }
  for (const row of backup.stores.block_revisions as BlockRevisionRow[]) {
    if (within(row.document_id)) await db.put('block_revisions', row);
  }

  return {
    kind: 'database',
    documentsAdded: added,
    documentsSkipped: skipped,
    documentTitles: addedTitles,
  };
}
