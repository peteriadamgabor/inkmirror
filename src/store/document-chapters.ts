/**
 * Chapter-aggregate mutations: create / delete / move / rename. Deletion
 * soft-deletes every block in the chapter (so they're recoverable from
 * the graveyard) before removing the chapter row itself; the floor is
 * one chapter — the last one cannot be deleted.
 */

import { unwrap } from 'solid-js/store';
import type { Block, Chapter, ChapterKind, UUID } from '@/types';
import * as repo from '@/db/repository';
import {
  canPersist,
  setStore,
  store,
  track,
  uuid,
} from './document';

const CHAPTER_KIND_DEFAULTS: Record<ChapterKind, { title: string; content: string }> = {
  standard:        { title: '',                content: '' },
  cover:           { title: 'Cover',           content: '' },
  dedication:      { title: 'Dedication',      content: 'For …' },
  epigraph:        { title: 'Epigraph',        content: '"…"\n\n— Author' },
  acknowledgments: { title: 'Acknowledgments', content: 'Thanks to …' },
  afterword:       { title: 'Afterword',       content: '' },
};

export function createChapter(
  kind: ChapterKind = 'standard',
): { chapterId: UUID; blockId: UUID } | null {
  if (!store.document) return null;
  const now = new Date().toISOString();
  const chapterId = uuid();
  const blockId = uuid();
  const existingCount = store.chapters.length;
  const defaults = CHAPTER_KIND_DEFAULTS[kind];
  const title =
    kind === 'standard' ? `Chapter ${existingCount + 1}` : defaults.title;
  const chapter: Chapter = {
    id: chapterId,
    document_id: store.document.id,
    title,
    order: existingCount,
    kind,
    created_at: now,
    updated_at: now,
  };
  const block: Block = {
    id: blockId,
    chapter_id: chapterId,
    type: 'text',
    content: defaults.content,
    order: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };
  setStore('chapters', (chs) => [...chs, chapter]);
  setStore('blocks', blockId, block);
  setStore('blockOrder', (order) => [...order, blockId]);
  setStore('activeChapterId', chapterId);

  if (canPersist() && store.document) {
    const documentId = store.document.id;
    track(repo.saveChapter(unwrap(chapter)).catch(() => undefined));
    track(repo.saveBlock(unwrap(block), documentId).catch(() => undefined));
  }

  return { chapterId, blockId };
}

/**
 * Delete a chapter: hard-remove the chapter row and soft-delete every
 * block that belonged to it (blocks go to the graveyard carrying a
 * deleted_from trail, so the user can restore individual blocks later).
 * Refuses to delete the last chapter — there must always be at least one.
 */
export function deleteChapter(chapterId: UUID): boolean {
  if (store.chapters.length <= 1) return false;
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter) return false;

  const doomedBlockIds = store.blockOrder.filter(
    (id) => store.blocks[id]?.chapter_id === chapterId,
  );
  const now = new Date().toISOString();

  // Soft-delete each block with a deleted_from trail so the graveyard
  // entry remembers which chapter it came from (even after the chapter
  // row itself disappears).
  for (const blockId of doomedBlockIds) {
    const block = store.blocks[blockId];
    if (!block) continue;
    const deletedFrom: NonNullable<Block['deleted_from']> = {
      chapter_id: chapterId,
      chapter_title: chapter.title,
      position: store.blockOrder.indexOf(blockId),
    };
    setStore('blocks', blockId, (b) => ({
      ...b,
      deleted_at: now,
      deleted_from: deletedFrom,
      updated_at: now,
    }));
    if (canPersist() && store.document) {
      track(
        repo
          .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
          .catch(() => undefined),
      );
    }
  }

  setStore(
    'blockOrder',
    store.blockOrder.filter((id) => !doomedBlockIds.includes(id)),
  );

  // Remove the chapter from the store and the active pointer.
  const remaining = store.chapters.filter((c) => c.id !== chapterId);
  setStore('chapters', remaining);
  if (store.activeChapterId === chapterId) {
    const fallback = remaining[0]?.id ?? null;
    setStore('activeChapterId', fallback);
  }

  if (canPersist()) {
    track(repo.deleteChapterRow(chapterId).catch(() => undefined));
  }
  return true;
}

export function moveChapter(chapterId: UUID, direction: 'up' | 'down'): boolean {
  const idx = store.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return false;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= store.chapters.length) return false;

  const now = new Date().toISOString();
  const chapters = store.chapters.slice();
  const temp = chapters[idx];
  chapters[idx] = chapters[swapIdx];
  chapters[swapIdx] = temp;

  // Rewrite order fields.
  chapters.forEach((c, i) => {
    if (c.order !== i) {
      setStore('chapters', i, (ch) => ({ ...ch, order: i, updated_at: now }));
    }
  });
  setStore('chapters', chapters);

  if (canPersist()) {
    for (const c of [chapters[idx], chapters[swapIdx]]) {
      track(repo.saveChapter(unwrap(c)).catch(() => undefined));
    }
  }
  return true;
}

export function renameChapter(chapterId: UUID, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  const idx = store.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return;
  const now = new Date().toISOString();
  setStore('chapters', idx, (c) => ({ ...c, title: trimmed, updated_at: now }));

  if (canPersist()) {
    const chapter = store.chapters[idx];
    track(repo.saveChapter(unwrap(chapter)).catch(() => undefined));
  }
}
