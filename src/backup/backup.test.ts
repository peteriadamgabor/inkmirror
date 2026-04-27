import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests, getDb } from '@/db/connection';
import { __setTestDb, deleteDocumentAllRows, loadDocument } from '@/db/repository';
import { exportDatabaseBackup, exportDocumentBundle } from './export';
import {
  importDatabaseBackup,
  importDocumentBundle,
  parseBundle,
} from './import';
import type { Block, Chapter, Character, Document } from '@/types';

async function resetDb(): Promise<void> {
  __setTestDb(null); // backup uses real getDb; ensure no test-injected stub
  // Close any open connection before deleting, or deleteDatabase blocks.
  try {
    const existing = await getDb();
    existing.close();
  } catch {
    // first run — nothing to close
  }
  __resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('inkmirror');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function fixture(docId = 'doc-1'): {
  document: Document;
  chapter: Chapter;
  block: Block;
  deletedBlock: Block;
  character: Character;
} {
  const now = new Date('2026-04-16T12:00:00.000Z').toISOString();
  const document: Document = {
    id: docId,
    title: 'Test Novel',
    author: 'Ada',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: 'char-1',
    created_at: now,
    updated_at: now,
  };
  const chapter: Chapter = {
    id: 'chap-1',
    document_id: docId,
    title: 'Chapter 1',
    order: 0,
    kind: 'standard',
    created_at: now,
    updated_at: now,
  };
  const block: Block = {
    id: 'blk-1',
    chapter_id: 'chap-1',
    type: 'dialogue',
    content: 'Hello.',
    order: 0,
    metadata: { type: 'dialogue', data: { speaker_id: 'char-1' } },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };
  const deletedBlock: Block = {
    id: 'blk-2',
    chapter_id: 'chap-1',
    type: 'text',
    content: 'Cut line.',
    order: 1,
    metadata: { type: 'text' },
    deleted_at: now,
    deleted_from: { chapter_id: 'chap-1', chapter_title: 'Chapter 1', position: 1 },
    created_at: now,
    updated_at: now,
  };
  const character: Character = {
    id: 'char-1',
    document_id: docId,
    name: 'Ada',
    aliases: ['A.'],
    notes: '',
    color: '#ff0000',
    created_at: now,
    updated_at: now,
  };
  return { document, chapter, block, deletedBlock, character };
}

async function seed(docId = 'doc-1'): Promise<void> {
  const { document, chapter, block, deletedBlock, character } = fixture(docId);
  const db = await getDb();
  await db.put('documents', {
    id: document.id,
    title: document.title,
    author: document.author,
    synopsis: document.synopsis,
    settings: document.settings,
    pov_character_id: document.pov_character_id,
    created_at: document.created_at,
    updated_at: document.updated_at,
    sync_enabled: false,
    last_sync_revision: 0,
    last_synced_at: null,
  });
  await db.put('chapters', {
    id: chapter.id,
    document_id: chapter.document_id,
    title: chapter.title,
    order_idx: chapter.order,
    kind: chapter.kind,
    created_at: chapter.created_at,
    updated_at: chapter.updated_at,
  });
  for (const b of [block, deletedBlock]) {
    await db.put('blocks', {
      id: b.id,
      document_id: docId,
      chapter_id: b.chapter_id,
      type: b.type,
      content: b.content,
      order_idx: b.order,
      metadata: b.metadata,
      deleted_at: b.deleted_at,
      deleted_from: b.deleted_from,
      created_at: b.created_at,
      updated_at: b.updated_at,
    });
  }
  await db.put('characters', {
    id: character.id,
    document_id: character.document_id,
    name: character.name,
    aliases: character.aliases,
    notes: character.notes,
    color: character.color,
    created_at: character.created_at,
    updated_at: character.updated_at,
  });
}

describe('backup roundtrip', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('exports a single document with graveyard + imports it into a clean DB', async () => {
    await seed('doc-1');
    const bundle = await exportDocumentBundle('doc-1');
    expect(bundle.kind).toBe('inkmirror.document');
    expect(bundle.blocks.length).toBe(2); // includes deleted
    expect(bundle.chapters.length).toBe(1);
    expect(bundle.characters.length).toBe(1);

    // Wipe and re-import.
    await resetDb();
    const result = await importDocumentBundle(bundle);
    expect(result.documentsAdded).toBe(1);

    const loaded = await loadDocument('doc-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.document.title).toBe('Test Novel');
    expect(loaded?.blocks.length).toBe(1); // loadDocument hides soft-deleted
    expect(loaded?.characters[0]?.name).toBe('Ada');
  });

  it('remaps IDs when importing a bundle whose doc id already exists', async () => {
    await seed('doc-1');
    const bundle = await exportDocumentBundle('doc-1');

    // Do NOT reset — import on top of existing data.
    const result = await importDocumentBundle(bundle);
    expect(result.documentsAdded).toBe(1);
    expect(result.documentTitles[0]).toContain('(imported)');

    const db = await getDb();
    const allDocs = await db.getAll('documents');
    expect(allDocs.length).toBe(2);
    const ids = new Set(allDocs.map((d) => d.id));
    expect(ids.has('doc-1')).toBe(true);
    const importedId = [...ids].find((id) => id !== 'doc-1');
    expect(importedId).toBeDefined();
    const importedChapters = await db.getAllFromIndex(
      'chapters',
      'by_document',
      importedId,
    );
    const importedBlocks = await db.getAllFromIndex('blocks', 'by_document', importedId);
    expect(importedChapters.length).toBe(1);
    expect(importedChapters[0].id).not.toBe('chap-1');
    for (const b of importedBlocks) {
      expect(b.chapter_id).toBe(importedChapters[0].id);
    }

    // Dialogue speaker_id remapped to new character id.
    const importedChars = await db.getAllFromIndex(
      'characters',
      'by_document',
      importedId,
    );
    expect(importedChars.length).toBe(1);
    const newCharId = importedChars[0].id;
    const dialogue = importedBlocks.find((b) => b.type === 'dialogue')!;
    const meta = dialogue.metadata as { type: 'dialogue'; data: { speaker_id: string } };
    expect(meta.data.speaker_id).toBe(newCharId);
  });

  it('replace strategy overwrites existing doc and wipes stale rows', async () => {
    await seed('doc-1');
    const bundle = await exportDocumentBundle('doc-1');

    // Mutate the existing doc in-place: add a second chapter that is NOT in the bundle.
    const db = await getDb();
    await db.put('chapters', {
      id: 'chap-stale',
      document_id: 'doc-1',
      title: 'Will be wiped',
      order_idx: 99,
      kind: 'standard',
      created_at: '2026-04-16T12:00:00.000Z',
      updated_at: '2026-04-16T12:00:00.000Z',
    });
    const before = await db.getAllFromIndex('chapters', 'by_document', 'doc-1');
    expect(before.length).toBe(2);

    const result = await importDocumentBundle(bundle, 'replace');
    expect(result.replaced).toBe(true);
    expect(result.documentsAdded).toBe(1);

    const after = await db.getAllFromIndex('chapters', 'by_document', 'doc-1');
    expect(after.length).toBe(1); // stale chapter gone, original bundle chapter restored
    expect(after[0].id).toBe('chap-1');

    const allDocs = await db.getAll('documents');
    expect(allDocs.length).toBe(1); // NOT duplicated
    expect(allDocs[0].id).toBe('doc-1');
    expect(allDocs[0].title).toBe('Test Novel'); // no "(imported)" suffix
  });

  it('full database backup roundtrips and skips docs that already exist', async () => {
    await seed('doc-a');
    await seed('doc-b');
    const backup = await exportDatabaseBackup();
    expect(backup.stores.documents.length).toBe(2);

    // Wipe one doc; import should restore the missing one and skip the kept one.
    const db = await getDb();
    await db.delete('documents', 'doc-a');

    const result = await importDatabaseBackup(backup);
    expect(result.documentsAdded).toBe(1);
    expect(result.documentsSkipped).toBe(1);

    const all = await db.getAll('documents');
    expect(all.map((d) => d.id).sort()).toEqual(['doc-a', 'doc-b']);
  });

  it('parseBundle rejects non-InkMirror JSON', async () => {
    const file = new File(['{"foo":"bar"}'], 'bad.json', { type: 'application/json' });
    await expect(parseBundle(file)).rejects.toThrow(/Not an InkMirror backup/);
  });

  it('parseBundle rejects malformed JSON', async () => {
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    await expect(parseBundle(file)).rejects.toThrow(/not valid JSON/);
  });

  it('replace-strategy import rejects a shape-compatible but broken bundle BEFORE wiping', async () => {
    await seed('doc-1');

    // Bundle has the right kind/version/envelope but its only block points at a
    // chapter that does not exist in the bundle — validation must reject.
    const malformed = {
      kind: 'inkmirror.document',
      version: 1 as const,
      exported_at: '2026-04-17T00:00:00.000Z',
      app_version: '0.0.0-test',
      document: {
        id: 'doc-1',
        title: 'Replacement',
        author: '',
        synopsis: '',
        settings: { font_family: '', font_size: 16, line_height: 1.8, editor_width: 680, theme: 'light' },
        pov_character_id: null,
        created_at: '2026-04-17T00:00:00.000Z',
        updated_at: '2026-04-17T00:00:00.000Z',
      },
      chapters: [],
      blocks: [
        {
          id: 'blk-bad',
          chapter_id: 'chap-missing',
          type: 'text',
          content: 'x',
          order: 0,
          metadata: { type: 'text' },
          deleted_at: null,
          deleted_from: null,
          created_at: '2026-04-17T00:00:00.000Z',
          updated_at: '2026-04-17T00:00:00.000Z',
        },
      ],
      characters: [],
      sentiments: [],
    };

    await expect(
      importDocumentBundle(malformed as never, 'replace'),
    ).rejects.toThrow(/chapter_id/);

    // Original doc must still be intact — wipe should not have happened.
    const loaded = await loadDocument('doc-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.document.title).toBe('Test Novel');
    expect(loaded?.blocks.length).toBe(1);
  });

  it('deleteDocumentAllRows removes block revisions too', async () => {
    await seed('doc-1');

    // Seed a revision for the live block.
    const db = await getDb();
    await db.put('block_revisions', {
      id: 'blk-1|2026-04-17T00:00:00.000Z',
      block_id: 'blk-1',
      document_id: 'doc-1',
      content: 'Old draft.',
      snapshot_at: '2026-04-17T00:00:00.000Z',
    });
    expect(
      (await db.getAllFromIndex('block_revisions', 'by_block', 'blk-1')).length,
    ).toBe(1);

    await deleteDocumentAllRows('doc-1');

    expect(await db.get('documents', 'doc-1')).toBeUndefined();
    expect(
      (await db.getAllFromIndex('blocks', 'by_document', 'doc-1')).length,
    ).toBe(0);
    expect(
      (await db.getAllFromIndex('block_revisions', 'by_block', 'blk-1')).length,
    ).toBe(0);
  });
});
