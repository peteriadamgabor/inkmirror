/**
 * Block-aggregate mutations: create/update/move/delete the live block
 * graph, plus the contenteditable-facing helpers (paste-splitting,
 * duplication, type conversion, dialogue/scene metadata edits) and the
 * graveyard/restore lifecycle. Undo/redo for block changes lives here
 * too — every entry kind in `UndoEntry` is block-scoped.
 *
 * Imports the shared store + persistence plumbing from `./document`,
 * which re-exports everything in this file.
 */

import { createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type {
  Block,
  BlockMetadata,
  BlockType,
  DialogueMetadata,
  Mark,
  SceneMetadata,
  UUID,
} from '@/types';
import {
  finalizePendingBatch,
  markExternalBlockChange,
  popRedo,
  popUndo,
  pushEntry,
  trackContentChange,
  type UndoEntry,
} from './undo';
import * as repo from '@/db/repository';
import type { BlockRevision } from '@/db/repository';
import { normalizeMarks } from '@/engine/marks';
import { contentHash } from '@/utils/hash';
import {
  canPersist,
  cancelPendingContentWrite,
  matchLeadingSpeaker,
  persistBlockNow,
  removeInconsistencyFlag,
  scheduleBlockContentWrite,
  setStore,
  store,
  track,
  uuid,
} from './document';

export interface UpdateBlockContentOptions {
  /**
   * Run the dialogue leading-"Name:" auto-detect. Only callers that know
   * the block is at an idle commit point (blur, type conversion) should
   * pass this, because auto-detect can strip the content prefix — and
   * doing that while the contenteditable is focused would desync the
   * DOM from the store.
   */
  detectSpeaker?: boolean;
  /**
   * Inline formatting ranges read from the DOM. When provided, replaces
   * the block's marks in full. Pass an empty array to clear. Omit to
   * leave marks untouched.
   */
  marks?: Mark[];
}

function defaultMetadataFor(type: BlockType): BlockMetadata {
  switch (type) {
    case 'text':     return { type: 'text' };
    case 'dialogue': return { type: 'dialogue', data: { speaker_id: '' } };
    case 'scene':    return { type: 'scene', data: { location: '', time: '', character_ids: [], mood: '' } };
    case 'note':     return { type: 'note', data: {} };
  }
}

export function updateBlockContent(
  blockId: UUID,
  content: string,
  opts: UpdateBlockContentOptions = {},
): void {
  const existing = store.blocks[blockId];
  if (!existing) return;

  // Snapshot the pre-mutation content as a primitive string. `existing`
  // is a Solid store proxy — after the setStore below, reading
  // `existing.content` returns the *new* value, which breaks any
  // post-mutation equality check (see inconsistency-flag invalidation).
  const prevContent: string = existing.content;

  // Track for undo before mutating.
  trackContentChange(blockId, existing.content, existing.marks ? [...existing.marks] : undefined);

  const now = new Date().toISOString();
  let nextContent = content;
  let nextMetadata: BlockMetadata | null = null;

  if (
    opts.detectSpeaker &&
    existing.metadata.type === 'dialogue' &&
    !(existing.metadata.data as DialogueMetadata).speaker_id
  ) {
    const match = matchLeadingSpeaker(content, unwrap(store.characters));
    if (match) {
      nextContent = match.rest;
      nextMetadata = {
        type: 'dialogue',
        data: {
          speaker_id: match.character.id,
          ...(existing.metadata.data.parenthetical
            ? { parenthetical: existing.metadata.data.parenthetical }
            : {}),
        },
      };
    }
  }

  let nextMarks: Mark[] | undefined = undefined;
  if (opts.marks !== undefined) {
    const normalized = normalizeMarks(opts.marks, nextContent.length);
    nextMarks = normalized.length > 0 ? normalized : undefined;
  }

  setStore('blocks', blockId, (b) => {
    const out: Block = {
      ...b,
      content: nextContent,
      metadata: nextMetadata ?? b.metadata,
      updated_at: now,
    };
    if (opts.marks !== undefined) {
      if (nextMarks) out.marks = nextMarks;
      else delete out.marks;
    }
    return out;
  });

  // Near tier: any inconsistency flag whose stored block hash no longer
  // matches the fresh content is stale — delete it. The writer is
  // changing the exact text the flag was scored against. Re-running
  // "Check now" (or the deep-opt-in auto-sweep) will re-emerge the flag
  // if the contradiction actually survived the edit.
  if (prevContent !== nextContent) {
    invalidateFlagsForBlock(blockId, nextContent);
  }

  scheduleBlockContentWrite(blockId);
}

function invalidateFlagsForBlock(blockId: UUID, newContent: string): void {
  const newHash = contentHash(newContent);
  const flags = store.inconsistencyFlags;
  for (const id of Object.keys(flags)) {
    const f = flags[id];
    const stale =
      (f.block_a_id === blockId && f.block_a_hash !== newHash) ||
      (f.block_b_id === blockId && f.block_b_hash !== newHash);
    if (stale) {
      removeInconsistencyFlag(id);
    }
  }
}

export function createBlockAfter(blockId: UUID, type: BlockType = 'text'): UUID {
  const existing = store.blocks[blockId];
  if (!existing) throw new Error(`createBlockAfter: unknown block ${blockId}`);

  const newId = uuid();
  const now = new Date().toISOString();
  const newBlock: Block = {
    id: newId,
    chapter_id: existing.chapter_id,
    type,
    content: '',
    order: existing.order + 1,
    metadata: defaultMetadataFor(type),
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };

  const idx = store.blockOrder.indexOf(blockId);
  const newOrder = [...store.blockOrder];
  newOrder.splice(idx + 1, 0, newId);

  setStore('blocks', newId, newBlock);
  setStore('blockOrder', newOrder);

  if (canPersist() && store.document) {
    track(repo.saveBlock(unwrap(newBlock), store.document.id).catch(() => undefined));
  }

  return newId;
}

export function createBlockBefore(blockId: UUID, type: BlockType = 'text'): UUID {
  const existing = store.blocks[blockId];
  if (!existing) throw new Error(`createBlockBefore: unknown block ${blockId}`);

  const newId = uuid();
  const now = new Date().toISOString();
  const newBlock: Block = {
    id: newId,
    chapter_id: existing.chapter_id,
    type,
    content: '',
    order: existing.order,
    metadata: defaultMetadataFor(type),
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };

  const idx = store.blockOrder.indexOf(blockId);
  const newOrder = [...store.blockOrder];
  newOrder.splice(Math.max(idx, 0), 0, newId);

  setStore('blocks', newId, newBlock);
  setStore('blockOrder', newOrder);

  if (canPersist() && store.document) {
    track(repo.saveBlock(unwrap(newBlock), store.document.id).catch(() => undefined));
  }

  return newId;
}

/**
 * Insert a chunk of text that contains paragraph breaks (\n\n+) into the
 * current block, splitting into multiple blocks so each pasted paragraph
 * lands in its own block. Respects the caret position inside the current
 * block — the text before the caret stays, the first pasted paragraph is
 * appended, subsequent paragraphs become new blocks, and any text that
 * was after the caret ends up at the tail of the last new block.
 *
 * Returns the id of the block the caret should land in, and the offset
 * within it.
 */
export function insertPastedParagraphs(
  blockId: UUID,
  caretOffset: number,
  text: string,
): { targetBlockId: UUID; caretOffset: number } {
  const block = store.blocks[blockId];
  if (!block) return { targetBlockId: blockId, caretOffset };
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\r/g, ''))
    .filter((p) => p.length > 0);
  if (paragraphs.length <= 1) {
    // Falls back to simple in-place insertion by the caller.
    return { targetBlockId: blockId, caretOffset };
  }
  const head = block.content.slice(0, caretOffset);
  const tail = block.content.slice(caretOffset);

  // First paragraph joins the existing head.
  const firstContent = head + paragraphs[0];
  updateBlockContent(blockId, firstContent);

  let previousId = blockId;
  // Middle paragraphs each become their own block.
  for (let i = 1; i < paragraphs.length - 1; i++) {
    const newId = createBlockAfter(previousId);
    updateBlockContent(newId, paragraphs[i]);
    previousId = newId;
  }
  // Last paragraph gets the pre-paste tail appended to it.
  const lastText = paragraphs[paragraphs.length - 1] + tail;
  const lastId = createBlockAfter(previousId);
  updateBlockContent(lastId, lastText);
  return {
    targetBlockId: lastId,
    caretOffset: paragraphs[paragraphs.length - 1].length,
  };
}

/**
 * Duplicate a block: creates a sibling immediately after the original
 * with identical type, content, and metadata. Returns the new block id.
 */
export function duplicateBlock(blockId: UUID): UUID | null {
  const source = store.blocks[blockId];
  if (!source) return null;
  const newId = createBlockAfter(blockId);
  const now = new Date().toISOString();
  setStore('blocks', newId, (b) => ({
    ...b,
    type: source.type,
    content: source.content,
    metadata: source.metadata,
    updated_at: now,
  }));
  if (canPersist() && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[newId]), store.document.id)
        .catch(() => undefined),
    );
  }
  return newId;
}

// ---------- undo / redo ----------

function applyUndoEntry(entry: UndoEntry, isRedo: boolean): void {
  switch (entry.kind) {
    case 'content-change': {
      const state = isRedo ? entry.after : entry.before;
      const block = store.blocks[entry.blockId];
      if (!block) return;
      const now = new Date().toISOString();
      setStore('blocks', entry.blockId, (b) => {
        const out: Block = { ...b, content: state.content, updated_at: now };
        if (state.marks && state.marks.length > 0) out.marks = state.marks;
        else delete out.marks;
        return out;
      });
      // Force-sync the (possibly focused) contenteditable DOM. Without
      // this pulse the BlockView effect would skip the write because
      // focus is still on the block from before Ctrl+Z.
      markExternalBlockChange(entry.blockId);
      if (canPersist() && store.document) {
        track(
          repo
            .saveBlock(unwrap(store.blocks[entry.blockId]), store.document.id)
            .catch(() => undefined),
        );
      }
      break;
    }
    case 'block-delete': {
      if (isRedo) {
        // Re-delete: same as the original deleteBlock but skip pushing undo again.
        deleteBlock(entry.block.id, true);
      } else {
        // Restore: re-insert the block at its original position.
        const restored: Block = {
          ...entry.block,
          deleted_at: null,
          deleted_from: null,
          updated_at: new Date().toISOString(),
        };
        setStore('blocks', restored.id, restored);
        const newOrder = [...store.blockOrder];
        const insertAt = Math.min(entry.orderIndex, newOrder.length);
        newOrder.splice(insertAt, 0, restored.id);
        setStore('blockOrder', newOrder);
        if (canPersist()) {
          track(
            repo
              .saveBlock(unwrap(store.blocks[restored.id]), entry.documentId)
              .catch(() => undefined),
          );
        }
      }
      break;
    }
    case 'type-change': {
      const state = isRedo ? entry.after : entry.before;
      const block = store.blocks[entry.blockId];
      if (!block) return;
      const now = new Date().toISOString();
      setStore('blocks', entry.blockId, (b) => ({
        ...b,
        type: state.type,
        metadata: state.metadata,
        content: state.content,
        updated_at: now,
      }));
      markExternalBlockChange(entry.blockId);
      if (canPersist() && store.document) {
        track(
          repo
            .saveBlock(unwrap(store.blocks[entry.blockId]), store.document.id)
            .catch(() => undefined),
        );
      }
      break;
    }
    case 'block-move': {
      const fromIdx = isRedo ? entry.toIndex : entry.fromIndex;
      const toIdx = isRedo ? entry.fromIndex : entry.toIndex;
      void fromIdx;
      // Just swap back — moveBlockToPosition handles the full reorder.
      moveBlockToPosition(entry.blockId, isRedo ? entry.toIndex : entry.fromIndex);
      void toIdx;
      break;
    }
  }
}

export function performUndo(): boolean {
  // Finalize any pending content batch so the current text is captured.
  if (store.blockOrder.length > 0) {
    const activeEl = document.activeElement as HTMLElement | null;
    const blockId = activeEl?.closest('[data-block-id]')?.getAttribute('data-block-id');
    if (blockId && store.blocks[blockId]) {
      finalizePendingBatch(
        blockId,
        store.blocks[blockId].content,
        store.blocks[blockId].marks,
      );
    }
  }
  const entry = popUndo();
  if (!entry) return false;
  applyUndoEntry(entry, false);
  return true;
}

export function performRedo(): boolean {
  const entry = popRedo();
  if (!entry) return false;
  applyUndoEntry(entry, true);
  return true;
}

/**
 * Move a block to an arbitrary target position in the blockOrder array.
 * Used by drag-and-drop reordering. The target index is in the space of
 * the CURRENT blockOrder — i.e. pass the index the dragged block should
 * end up at in the final array. Same-chapter constraint enforced: drops
 * into a different chapter are rejected (we just realign to the nearest
 * same-chapter index to avoid silent chapter reassignment).
 */
export function moveBlockToPosition(blockId: UUID, targetIndex: number): boolean {
  const order = store.blockOrder;
  const sourceIdx = order.indexOf(blockId);
  if (sourceIdx < 0) return false;
  if (targetIndex === sourceIdx || targetIndex === sourceIdx + 1) return false;

  const current = store.blocks[blockId];
  if (!current) return false;

  // Build the new order: remove source, insert at target.
  const newOrder = order.slice();
  const [moved] = newOrder.splice(sourceIdx, 1);
  // If the source came before the target, the removal shifted everything
  // left by one, so the target index needs to shift too.
  const adjusted = targetIndex > sourceIdx ? targetIndex - 1 : targetIndex;
  newOrder.splice(adjusted, 0, moved);

  // Cross-chapter check: the dropped block must land between or at the
  // edges of same-chapter blocks. If it would land between blocks from
  // different chapters, snap to the nearest same-chapter boundary.
  const beforeId = newOrder[adjusted - 1];
  const afterId = newOrder[adjusted + 1];
  const beforeBlock = beforeId ? store.blocks[beforeId] : null;
  const afterBlock = afterId ? store.blocks[afterId] : null;
  const beforeChapter = beforeBlock?.chapter_id;
  const afterChapter = afterBlock?.chapter_id;
  if (
    (beforeChapter && beforeChapter !== current.chapter_id) &&
    (afterChapter && afterChapter !== current.chapter_id)
  ) {
    return false;
  }

  setStore('blockOrder', newOrder);

  // Rewrite `order` fields for every block in the source block's chapter
  // so loadDocument rehydrates in the right sequence after reload.
  const now = new Date().toISOString();
  const chapterId = current.chapter_id;
  let orderIdx = 0;
  const documentId = store.document?.id;
  for (const id of newOrder) {
    const b = store.blocks[id];
    if (!b || b.chapter_id !== chapterId) continue;
    if (b.order !== orderIdx) {
      setStore('blocks', id, (old) => ({ ...old, order: orderIdx, updated_at: now }));
      if (canPersist() && documentId) {
        track(repo.saveBlock(unwrap(store.blocks[id]), documentId).catch(() => undefined));
      }
    }
    orderIdx++;
  }
  return true;
}

export function moveBlock(blockId: UUID, direction: 'up' | 'down'): boolean {
  const current = store.blocks[blockId];
  if (!current) return false;
  const order = store.blockOrder;
  const idx = order.indexOf(blockId);
  if (idx < 0) return false;

  // Find the nearest neighbor in the same chapter in the requested direction.
  const step = direction === 'up' ? -1 : 1;
  let neighborIdx = idx + step;
  while (
    neighborIdx >= 0 &&
    neighborIdx < order.length &&
    store.blocks[order[neighborIdx]]?.chapter_id !== current.chapter_id
  ) {
    neighborIdx += step;
  }
  if (neighborIdx < 0 || neighborIdx >= order.length) return false;
  if (store.blocks[order[neighborIdx]]?.chapter_id !== current.chapter_id) return false;

  const neighborId = order[neighborIdx];
  const neighbor = store.blocks[neighborId];
  if (!neighbor) return false;

  const newOrder = order.slice();
  newOrder[idx] = neighborId;
  newOrder[neighborIdx] = blockId;
  setStore('blockOrder', newOrder);

  // Swap the persisted `order` field so loadDocument rehydrates in the
  // correct sequence after reload.
  const now = new Date().toISOString();
  const currentOrderValue = current.order;
  const neighborOrderValue = neighbor.order;
  setStore('blocks', blockId, (b) => ({ ...b, order: neighborOrderValue, updated_at: now }));
  setStore('blocks', neighborId, (b) => ({ ...b, order: currentOrderValue, updated_at: now }));

  if (canPersist() && store.document) {
    const documentId = store.document.id;
    track(repo.saveBlock(unwrap(store.blocks[blockId]), documentId).catch(() => undefined));
    track(repo.saveBlock(unwrap(store.blocks[neighborId]), documentId).catch(() => undefined));
  }

  return true;
}

export function updateBlockType(blockId: UUID, type: BlockType): void {
  const block = store.blocks[blockId];
  if (!block || block.type === type) return;

  // Snapshot for undo before mutating.
  finalizePendingBatch(blockId, block.content, block.marks);
  const beforeState = {
    type: block.type,
    metadata: { ...unwrap(block.metadata) } as BlockMetadata,
    content: block.content,
  };

  const now = new Date().toISOString();
  let metadata = defaultMetadataFor(type);
  let content = block.content;

  // Converting to dialogue is an idle commit point — try to auto-detect a
  // leading "Name:" prefix so the writer who typed "Alice: Hello" and then
  // switched the block type gets the speaker populated for free.
  if (type === 'dialogue') {
    const match = matchLeadingSpeaker(content, unwrap(store.characters));
    if (match) {
      content = match.rest;
      metadata = {
        type: 'dialogue',
        data: { speaker_id: match.character.id },
      };
    }
  }

  setStore('blocks', blockId, (b) => ({
    ...b,
    type,
    metadata,
    content,
    updated_at: now,
  }));

  pushEntry({
    kind: 'type-change',
    blockId,
    before: beforeState,
    after: { type, metadata, content },
  });

  if (canPersist() && store.document) {
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}

/**
 * Assign or clear the speaker on a dialogue block. Pass `null` to unassign.
 * No-op for blocks that aren't of type dialogue.
 */
export function updateDialogueSpeaker(
  blockId: UUID,
  characterId: UUID | null,
): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'dialogue') return;
  const now = new Date().toISOString();
  const existingParenthetical = block.metadata.data.parenthetical;
  const next: BlockMetadata = {
    type: 'dialogue',
    data: {
      speaker_id: characterId ?? '',
      ...(existingParenthetical ? { parenthetical: existingParenthetical } : {}),
    },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (canPersist() && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
        .catch(() => undefined),
    );
  }
}

export function updateDialogueParenthetical(
  blockId: UUID,
  parenthetical: string,
): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'dialogue') return;
  const now = new Date().toISOString();
  const trimmed = parenthetical.trim();
  const next: BlockMetadata = {
    type: 'dialogue',
    data: {
      speaker_id: block.metadata.data.speaker_id,
      ...(trimmed ? { parenthetical: trimmed } : {}),
    },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (canPersist() && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
        .catch(() => undefined),
    );
  }
}

export function updateSceneMetadata(blockId: UUID, patch: Partial<SceneMetadata>): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'scene') return;
  const now = new Date().toISOString();
  const next: BlockMetadata = {
    type: 'scene',
    data: { ...block.metadata.data, ...patch },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (canPersist() && store.document) {
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}

// ---------- graveyard ----------

const [graveyard, setGraveyard] = createSignal<Block[]>([]);

export const graveyardBlocks = graveyard;

// ---------- per-block revision history ----------

export async function loadBlockRevisions(blockId: UUID): Promise<BlockRevision[]> {
  try {
    return await repo.loadRevisions(blockId);
  } catch {
    return [];
  }
}

export function restoreBlockContent(blockId: UUID, content: string): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const now = new Date().toISOString();
  setStore('blocks', blockId, (b) => ({ ...b, content, updated_at: now }));
  // Persist immediately — don't debounce — so the restored content is safe.
  persistBlockNow(blockId);
  // Place caret at the end of the restored content so the writer can
  // keep typing without guessing where the cursor went.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"] [data-editable]`,
    );
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

async function recoverLastNonEmpty(blockId: UUID): Promise<string | null> {
  const revs = await repo.loadRevisions(blockId);
  const latest = revs.find((r) => r.content.trim().length > 0);
  return latest?.content ?? null;
}

export async function refreshGraveyard(): Promise<void> {
  if (!store.document) return;
  try {
    const rows = await repo.loadDeletedBlocks(store.document.id);
    // Blocks are typically deleted only after their content was backspaced
    // to empty, so the row itself is empty. Join with the revision store
    // to surface the last non-empty version for display.
    const enriched = await Promise.all(
      rows.map(async (b) => {
        if (b.content.trim().length > 0) return b;
        const recovered = await recoverLastNonEmpty(b.id);
        return recovered ? { ...b, content: recovered } : b;
      }),
    );
    setGraveyard(enriched);
  } catch {
    /* swallow — non-critical */
  }
}

export async function restoreBlock(blockId: UUID): Promise<void> {
  if (!store.document) return;
  const documentId = store.document.id;
  const restored = await repo.restoreBlock(blockId, documentId);
  if (!restored) return;
  // If the stored row is empty (the usual case — deleted_at flipped after
  // the user had already backspaced the text), recover the last non-empty
  // revision so the user gets their writing back, not an empty shell.
  let content = restored.content;
  if (content.trim().length === 0) {
    const recovered = await recoverLastNonEmpty(blockId);
    if (recovered) content = recovered;
  }
  // Attach to its original chapter if it still exists, else to the active one.
  const chapterId =
    store.chapters.some((c) => c.id === restored.chapter_id)
      ? restored.chapter_id
      : store.activeChapterId ?? store.chapters[0]?.id;
  if (!chapterId) return;
  const rehydrated: Block = {
    ...restored,
    chapter_id: chapterId,
    content,
    deleted_at: null,
    deleted_from: null,
  };
  setStore('blocks', rehydrated.id, rehydrated);
  setStore('blockOrder', (order) => [...order, rehydrated.id]);
  // Persist the enriched row back so reloads see the recovered content.
  track(repo.saveBlock(unwrap(store.blocks[rehydrated.id]), documentId).catch(() => undefined));
  await refreshGraveyard();
}

export function deleteBlock(blockId: UUID, skipUndo = false): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const chapter = store.chapters.find((c) => c.id === block.chapter_id);
  const position = store.blockOrder.indexOf(blockId);

  // Finalize any pending content batch for this block before deleting.
  finalizePendingBatch(blockId, block.content, block.marks);
  if (!skipUndo && store.document) {
    pushEntry({
      kind: 'block-delete',
      block: { ...unwrap(block) },
      orderIndex: position,
      documentId: store.document.id,
    });
  }
  const now = new Date().toISOString();
  const deletedFrom: NonNullable<Block['deleted_from']> = {
    chapter_id: block.chapter_id,
    chapter_title: chapter?.title ?? '',
    position,
  };
  setStore(
    'blockOrder',
    store.blockOrder.filter((id) => id !== blockId),
  );
  setStore('blocks', blockId, (b) => ({
    ...b,
    deleted_at: now,
    deleted_from: deletedFrom,
    updated_at: now,
  }));

  if (canPersist() && store.document) {
    // Cancel any pending debounced content write — we're about to persist
    // the full row below, so the debounced write would only race with it.
    cancelPendingContentWrite(blockId);
    // Write content + deleted_at in one op so the graveyard preserves
    // whatever the user typed right up to the moment of deletion.
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}
