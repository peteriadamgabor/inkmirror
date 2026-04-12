import { createStore } from 'solid-js/store';
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
