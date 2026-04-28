import { createSignal } from 'solid-js';
import type { Block, BlockMetadata, BlockType, Mark, UUID } from '@/types';

// ---------- external-DOM-sync pulse ----------
//
// BlockView intentionally skips store→DOM writes while the block is
// focused so we don't fight the user's caret. But that means
// externally-triggered store mutations (undo, redo, future remote
// sync) leave the focused contenteditable displaying stale text.
//
// This signal is a pulse: every time an external actor mutates a
// block's content, they increment it with the affected blockId and a
// monotonic rev. BlockView observes it and force-writes DOM for its
// own id even through the focus guard.
const [externalSync, setExternalSync] = createSignal<
  { blockId: UUID; rev: number } | null
>(null);
export { externalSync };

let externalSyncRev = 0;
export function markExternalBlockChange(blockId: UUID): void {
  externalSyncRev++;
  setExternalSync({ blockId, rev: externalSyncRev });
}

// ---------- entry types ----------

export interface ContentChangeEntry {
  kind: 'content-change';
  blockId: UUID;
  before: { content: string; marks?: Mark[] };
  after: { content: string; marks?: Mark[] };
}

export interface BlockDeleteEntry {
  kind: 'block-delete';
  block: Block;
  orderIndex: number;
  documentId: UUID;
}

export interface TypeChangeEntry {
  kind: 'type-change';
  blockId: UUID;
  before: { type: BlockType; metadata: BlockMetadata; content: string };
  after: { type: BlockType; metadata: BlockMetadata; content: string };
}

export interface BlockMoveEntry {
  kind: 'block-move';
  blockId: UUID;
  fromIndex: number;
  toIndex: number;
}

export type UndoEntry =
  | ContentChangeEntry
  | BlockDeleteEntry
  | TypeChangeEntry
  | BlockMoveEntry;

// ---------- stack ----------

const MAX_ENTRIES = 50;
const CONTENT_BATCH_MS = 2000;

let entries: UndoEntry[] = [];
let cursor = -1; // points at the most recent undo-able entry

// Reactive signals so the UI can show undo/redo availability.
const [canUndo, setCanUndo] = createSignal(false);
const [canRedo, setCanRedo] = createSignal(false);
export { canUndo, canRedo };

function updateSignals(): void {
  setCanUndo(cursor >= 0);
  setCanRedo(cursor < entries.length - 1);
}

// ---------- content-change batching ----------

let pendingContentBatch: {
  blockId: UUID;
  before: { content: string; marks?: Mark[] };
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function flushContentBatch(): void {
  pendingContentBatch = null;
  // The "after" state is captured at undo-time from the live store,
  // not at flush-time, because the block may still be mid-edit.
  // We rely on the entry already pushed by startContentBatch.
}

/**
 * Called by updateBlockContent before each store write. Batches
 * keystrokes into one undo entry per block per ~2 seconds of
 * continuous typing. Only the first call in a batch captures the
 * "before" state; subsequent calls extend the timer.
 */
export function trackContentChange(
  blockId: UUID,
  currentContent: string,
  currentMarks: Mark[] | undefined,
): void {
  if (pendingContentBatch && pendingContentBatch.blockId !== blockId) {
    // Switched to a different block — finalize the old batch and
    // snapshot the "after" for it.
    finalizePendingBatch(pendingContentBatch.blockId);
  }
  if (!pendingContentBatch || pendingContentBatch.blockId !== blockId) {
    // Start a new batch: capture the before-state.
    pendingContentBatch = {
      blockId,
      before: { content: currentContent, marks: currentMarks ? [...currentMarks] : undefined },
      timer: setTimeout(flushContentBatch, CONTENT_BATCH_MS),
    };
  } else {
    // Extend the existing batch timer.
    clearTimeout(pendingContentBatch.timer);
    pendingContentBatch.timer = setTimeout(flushContentBatch, CONTENT_BATCH_MS);
  }
}

/**
 * Finalize the pending content batch by pushing an undo entry with
 * the "after" state read from a callback. Must be called before any
 * structural mutation so the batch doesn't span across a delete/move.
 */
export function finalizePendingBatch(
  blockId?: UUID,
  afterContent?: string,
  afterMarks?: Mark[],
): void {
  if (!pendingContentBatch) return;
  if (blockId && pendingContentBatch.blockId !== blockId) return;
  clearTimeout(pendingContentBatch.timer);
  const entry: ContentChangeEntry = {
    kind: 'content-change',
    blockId: pendingContentBatch.blockId,
    before: pendingContentBatch.before,
    after: {
      content: afterContent ?? pendingContentBatch.before.content,
      marks: afterMarks,
    },
  };
  // Only push if content actually changed.
  if (
    entry.before.content !== entry.after.content ||
    JSON.stringify(entry.before.marks) !== JSON.stringify(entry.after.marks)
  ) {
    pushEntry(entry);
  }
  pendingContentBatch = null;
}

// ---------- public API ----------

export function pushEntry(entry: UndoEntry): void {
  // Clear any redo entries past the cursor.
  entries = entries.slice(0, cursor + 1);
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  cursor = entries.length - 1;
  updateSignals();
}

export function popUndo(): UndoEntry | null {
  // Finalize any pending content batch first so the undo entry
  // includes the most recent text.
  if (pendingContentBatch) {
    // Can't read the store here (circular dep), so the caller must
    // finalize before calling popUndo.
  }
  if (cursor < 0) return null;
  const entry = entries[cursor];
  cursor--;
  updateSignals();
  return entry;
}

export function popRedo(): UndoEntry | null {
  if (cursor >= entries.length - 1) return null;
  cursor++;
  updateSignals();
  return entries[cursor];
}

export function clearUndoStack(): void {
  entries = [];
  cursor = -1;
  pendingContentBatch = null;
  updateSignals();
}
