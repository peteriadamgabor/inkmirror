import { createStore, produce } from 'solid-js/store';
import type { Block, Chapter, Document, UUID } from '@/types';
import type { SyntheticDoc } from '@/engine/synthetic';

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

export function setViewport(scrollTop: number, viewportHeight: number): void {
  setStore('viewport', { scrollTop, viewportHeight });
}

export function setMeasurement(blockId: UUID, measurement: BlockMeasurement): void {
  setStore('measurements', blockId, measurement);
}

function uuid(): string {
  return crypto.randomUUID();
}

export function updateBlockContent(blockId: UUID, content: string): void {
  if (!store.blocks[blockId]) return;
  const now = new Date().toISOString();
  setStore('blocks', blockId, (b) => ({ ...b, content, updated_at: now }));
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
  deleteBlock(blockId);

  return { previousId, cursorOffset };
}

export function deleteBlock(blockId: UUID): void {
  if (!store.blocks[blockId]) return;
  const newOrder = store.blockOrder.filter((id) => id !== blockId);
  setStore('blockOrder', newOrder);
  setStore(
    'blocks',
    produce((blocks) => {
      delete blocks[blockId];
    }),
  );
}
