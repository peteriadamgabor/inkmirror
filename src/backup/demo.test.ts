import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests, getDb } from '@/db/connection';
import { __setTestDb } from '@/db/repository';
import { DEMO_DOC_ID, getDemoBundle } from './demo-bundle';
import { validateDocumentBundle } from './format';
import { importDocumentBundle } from './import';

async function resetDb(): Promise<void> {
  __setTestDb(null);
  try {
    const existing = await getDb();
    existing.close();
  } catch {
    /* first run */
  }
  __resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('inkmirror');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('demo bundle', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('English bundle passes deep schema validation', () => {
    const bundle = getDemoBundle('en');
    expect(() => validateDocumentBundle(bundle)).not.toThrow();
  });

  it('Hungarian bundle passes deep schema validation', () => {
    const bundle = getDemoBundle('hu');
    expect(() => validateDocumentBundle(bundle)).not.toThrow();
  });

  it('has the fixed demo document id', () => {
    expect(getDemoBundle('en').document.id).toBe(DEMO_DOC_ID);
    expect(getDemoBundle('hu').document.id).toBe(DEMO_DOC_ID);
  });

  it('has 3 chapters, two characters, and at least one scene block', () => {
    const b = getDemoBundle('en');
    expect(b.chapters.length).toBe(3);
    expect(b.characters.length).toBe(2);
    expect(b.blocks.some((bl) => bl.type === 'scene')).toBe(true);
    expect(b.blocks.some((bl) => bl.type === 'dialogue')).toBe(true);
    expect(b.blocks.some((bl) => bl.type === 'note')).toBe(true);
  });

  it('includes soft-deleted graveyard blocks', () => {
    const b = getDemoBundle('en');
    const gravestones = b.blocks.filter((bl) => bl.deleted_at !== null);
    expect(gravestones.length).toBeGreaterThanOrEqual(1);
    for (const g of gravestones) {
      expect(g.deleted_from).not.toBeNull();
    }
  });

  it('ships sentiments covering the live (non-deleted) blocks', () => {
    const b = getDemoBundle('en');
    const liveBlockIds = new Set(
      b.blocks.filter((bl) => bl.deleted_at === null).map((bl) => bl.id),
    );
    // Every sentiment maps to a live block.
    for (const s of b.sentiments) {
      expect(liveBlockIds.has(s.blockId)).toBe(true);
    }
    // And we should have sentiment coverage on a meaningful chunk of
    // live blocks — the whole point is the ECG drawing immediately.
    expect(b.sentiments.length).toBeGreaterThan(liveBlockIds.size / 2);
  });

  it('round-trips through importDocumentBundle', async () => {
    const bundle = getDemoBundle('en');
    const result = await importDocumentBundle(bundle, 'copy');
    expect(result.documentsAdded).toBe(1);

    const db = await getDb();
    const storedDoc = await db.get('documents', DEMO_DOC_ID);
    expect(storedDoc?.title).toBe(bundle.document.title);

    const storedChapters = await db.getAllFromIndex(
      'chapters',
      'by_document',
      DEMO_DOC_ID,
    );
    expect(storedChapters.length).toBe(3);
  });
});
