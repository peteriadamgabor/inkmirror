import type { Block, Chapter, Character, Document, UUID } from '@/types';
import {
  getDb,
  type BlockRevisionRow,
  type InkMirrorDb,
  type SentimentRow,
} from '@/db/connection';
import {
  DOCUMENT_ROW_STORES,
  deleteDocumentRowsWithin,
  disambiguateTitle,
} from '@/db/repository';
import {
  blockToRow,
  chapterToRow,
  characterToRow,
  documentToRow,
} from '@/db/repository-rows';
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

  // Build every row in memory first; all IDB writes (including the
  // replace-strategy wipe) happen in ONE transaction at the end, so a
  // failure anywhere rolls the whole import back — the pre-import
  // document survives a botched replace.
  const chapterRows = bundle.chapters.map((ch) =>
    chapterToRow({
      ...ch,
      id: mapId(chapterIdMap, ch.id),
      document_id: newDocId,
    } satisfies Chapter),
  );

  const characterRows = bundle.characters.map((c) =>
    characterToRow({
      ...c,
      id: mapId(characterIdMap, c.id),
      document_id: newDocId,
    } satisfies Character),
  );

  // Soft-deleted blocks may carry a stale live `chapter_id` (or even a
  // stale `deleted_from.chapter_id`) when their original chapter was
  // hard-deleted while they sat in the graveyard. Pick a surviving
  // chapter as the universal fallback so no on-disk reference dangles.
  const fallbackChapterId: UUID | null =
    bundle.chapters.length > 0
      ? mapId(chapterIdMap, bundle.chapters[0].id)
      : null;

  const blockRows = bundle.blocks.map((b) => {
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
    return blockToRow(imported, newDocId);
  });

  const sentimentRows: SentimentRow[] = bundle.sentiments.map((s) => ({
    block_id: mapId(blockIdMap, s.blockId),
    document_id: newDocId,
    label: s.label,
    score: s.score,
    content_hash: s.contentHash,
    analyzed_at: s.analyzedAt,
    source: s.source,
  }));

  const tx = db.transaction([...DOCUMENT_ROW_STORES], 'readwrite');
  // Collect write promises one by one so that when put() throws
  // synchronously (un-cloneable row), every already-issued request is in
  // `writes` and can be settled on the failure path — otherwise they
  // reject unobserved once the transaction aborts.
  const writes: Promise<unknown>[] = [];
  try {
    if (collides && strategy === 'replace') {
      // Same transaction as the writes below: if any insert fails, the
      // wipe rolls back too and the original document is untouched.
      await deleteDocumentRowsWithin(tx, bundle.document.id);
    }
    writes.push(tx.objectStore('documents').put(documentToRow(importedDoc)));
    for (const r of chapterRows) writes.push(tx.objectStore('chapters').put(r));
    for (const r of characterRows) writes.push(tx.objectStore('characters').put(r));
    for (const r of blockRows) writes.push(tx.objectStore('blocks').put(r));
    for (const r of sentimentRows) writes.push(tx.objectStore('sentiments').put(r));
    await Promise.all([...writes, tx.done]);
  } catch (err) {
    // Absorb tx.done FIRST — it rejects as soon as the abort lands,
    // before the individual write promises settle.
    tx.done.catch(() => undefined);
    // Explicit abort: a synchronous put() throw would otherwise let the
    // already-issued wipe commit.
    try {
      tx.abort();
    } catch {
      /* transaction already aborted or finished */
    }
    await Promise.allSettled(writes);
    throw err;
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

  const docsToImport = backup.stores.documents.filter((d) => {
    if (existingDocIds.has(d.id)) {
      skipped++;
      return false;
    }
    importableDocIds.add(d.id);
    added++;
    addedTitles.push(d.title || 'Untitled');
    return true;
  });

  const within = (docId: string | undefined | null) =>
    !!docId && importableDocIds.has(docId);

  // All writes in one transaction: a restore either lands completely or
  // not at all — no orphaned chapters/blocks if IDB fails mid-restore.
  const tx = db.transaction(
    ['documents', 'chapters', 'blocks', 'sentiments', 'characters', 'block_revisions'],
    'readwrite',
  );
  const writes: Promise<unknown>[] = [];
  try {
    for (const d of docsToImport) writes.push(tx.objectStore('documents').put(d));
    for (const row of backup.stores.chapters) {
      if (within(row.document_id)) writes.push(tx.objectStore('chapters').put(row));
    }
    for (const row of backup.stores.blocks) {
      if (within(row.document_id)) writes.push(tx.objectStore('blocks').put(row));
    }
    for (const row of backup.stores.sentiments) {
      if (within(row.document_id)) writes.push(tx.objectStore('sentiments').put(row));
    }
    for (const row of backup.stores.characters) {
      if (within(row.document_id)) writes.push(tx.objectStore('characters').put(row));
    }
    for (const row of backup.stores.block_revisions as BlockRevisionRow[]) {
      if (within(row.document_id)) writes.push(tx.objectStore('block_revisions').put(row));
    }
    await Promise.all([...writes, tx.done]);
  } catch (err) {
    tx.done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      /* transaction already aborted or finished */
    }
    await Promise.allSettled(writes);
    throw err;
  }

  return {
    kind: 'database',
    documentsAdded: added,
    documentsSkipped: skipped,
    documentTitles: addedTitles,
  };
}
