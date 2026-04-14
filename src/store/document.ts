import { createStore, unwrap } from 'solid-js/store';
import type { Block, Chapter, Document, UUID } from '@/types';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { LoadedDocument } from '@/db/repository';
import * as repo from '@/db/repository';

export interface ViewportState {
  scrollTop: number;
  viewportHeight: number;
}

export interface BlockMeasurement {
  height: number;
  contentHash: string;
}

export interface AppState {
  document: Document | null;
  chapters: Chapter[];
  blocks: Record<UUID, Block>;
  blockOrder: UUID[];
  activeChapterId: UUID | null;
  measurements: Record<UUID, BlockMeasurement>;
  viewport: ViewportState;
}

const initialState: AppState = {
  document: null,
  chapters: [],
  blocks: {},
  blockOrder: [],
  activeChapterId: null,
  measurements: {},
  viewport: { scrollTop: 0, viewportHeight: 0 },
};

export const [store, setStore] = createStore<AppState>(initialState);

// ---------- persistence plumbing ----------

const CONTENT_DEBOUNCE_MS = 500;
let persistEnabled = true;
const pendingWrites = new Set<Promise<unknown>>();
const pendingContentTimers = new Map<UUID, ReturnType<typeof setTimeout>>();
const dirtyContentBlocks = new Set<UUID>();

export function setPersistEnabled(enabled: boolean): void {
  persistEnabled = enabled;
}

function track<T>(p: Promise<T>): Promise<T> {
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
  return p;
}

function persistBlockNow(blockId: UUID): void {
  dirtyContentBlocks.delete(blockId);
  const timer = pendingContentTimers.get(blockId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingContentTimers.delete(blockId);
  }
  if (!persistEnabled) return;
  const documentId = store.document?.id;
  const block = store.blocks[blockId];
  if (!documentId || !block) return;
  track(repo.saveBlock(unwrap(block), documentId).catch(() => undefined));
}

function scheduleBlockContentWrite(blockId: UUID): void {
  if (!persistEnabled) return;
  dirtyContentBlocks.add(blockId);
  const existing = pendingContentTimers.get(blockId);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingContentTimers.delete(blockId);
    persistBlockNow(blockId);
  }, CONTENT_DEBOUNCE_MS);
  pendingContentTimers.set(blockId, timer);
}

export async function flushPendingWrites(timeoutMs = 200): Promise<void> {
  for (const blockId of [...dirtyContentBlocks]) {
    persistBlockNow(blockId);
  }
  if (pendingWrites.size === 0) return;
  await Promise.race([
    Promise.allSettled([...pendingWrites]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

// ---------- hydration ----------

export function loadSyntheticDoc(doc: SyntheticDoc): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of doc.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  setStore({
    document: doc.document,
    chapters: doc.chapters,
    blocks,
    blockOrder,
    activeChapterId: doc.chapters[0]?.id ?? null,
    measurements: {},
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}

export function hydrateFromLoaded(loaded: LoadedDocument): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of loaded.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  setStore({
    document: loaded.document,
    chapters: loaded.chapters,
    blocks,
    blockOrder,
    activeChapterId: loaded.chapters[0]?.id ?? null,
    measurements: {},
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}

// ---------- viewport + measurements ----------

export function setViewport(scrollTop: number, viewportHeight: number): void {
  setStore('viewport', { scrollTop, viewportHeight });
}

export function setMeasurement(blockId: UUID, measurement: BlockMeasurement): void {
  setStore('measurements', blockId, measurement);
}

// ---------- mutations ----------

function uuid(): string {
  return crypto.randomUUID();
}

export function updateBlockContent(blockId: UUID, content: string): void {
  if (!store.blocks[blockId]) return;
  const now = new Date().toISOString();
  setStore('blocks', blockId, (b) => ({ ...b, content, updated_at: now }));
  scheduleBlockContentWrite(blockId);
}

export function createBlockAfter(blockId: UUID): UUID {
  const existing = store.blocks[blockId];
  if (!existing) throw new Error(`createBlockAfter: unknown block ${blockId}`);

  const newId = uuid();
  const now = new Date().toISOString();
  const newBlock: Block = {
    id: newId,
    chapter_id: existing.chapter_id,
    type: 'text',
    content: '',
    order: existing.order + 1,
    metadata: { type: 'text' },
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

  if (persistEnabled && store.document) {
    track(repo.saveBlock(unwrap(newBlock), store.document.id).catch(() => undefined));
  }

  return newId;
}

export function mergeBlockWithPrevious(
  blockId: UUID,
): { previousId: UUID; cursorOffset: number } | null {
  const idx = store.blockOrder.indexOf(blockId);
  if (idx <= 0) return null;
  const previousId = store.blockOrder[idx - 1];
  const previous = store.blocks[previousId];
  const current = store.blocks[blockId];
  if (!previous || !current) return null;

  const cursorOffset = previous.content.length;
  const mergedContent = previous.content + current.content;

  updateBlockContent(previousId, mergedContent);
  // ensure the merged content hits disk immediately so the soft-delete is
  // never visible before the merge
  persistBlockNow(previousId);
  deleteBlock(blockId);

  return { previousId, cursorOffset };
}

export function deleteBlock(blockId: UUID): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const chapter = store.chapters.find((c) => c.id === block.chapter_id);
  const position = store.blockOrder.indexOf(blockId);
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

  if (persistEnabled) {
    track(repo.softDeleteBlock(blockId, deletedFrom).catch(() => undefined));
  }
}
