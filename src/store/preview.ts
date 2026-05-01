import { createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { UUID } from '@/types';
import * as repo from '@/db/repository';
import { store, setStore, track } from './document';

export interface PreviewState {
  blockId: UUID;
  content: string;
  snapshotAt: string;
}

const [state, setState] = createSignal<PreviewState | null>(null);

export const previewState = state;

export function enterPreview(blockId: UUID, content: string, snapshotAt: string): void {
  setState({ blockId, content, snapshotAt });
}

export function exitPreview(): void {
  setState(null);
}

export function isPreviewing(blockId: UUID): boolean {
  const s = state();
  return s !== null && s.blockId === blockId;
}

export async function commitPreview(): Promise<void> {
  const s = state();
  if (!s) return;
  const documentId = store.document?.id;
  const block = store.blocks[s.blockId];
  if (!documentId || !block) {
    setState(null);
    return;
  }
  const liveContent = block.content;
  if (liveContent === s.content) {
    setState(null);
    return;
  }
  const nowIso = new Date().toISOString();
  await track(
    repo
      .saveRevision({
        blockId: s.blockId,
        documentId,
        content: liveContent,
        snapshotAt: nowIso,
      })
      .catch((err) => {
        // Pre-restore snapshot failed — do NOT overwrite live content.
        // Clear preview state and re-throw so the caller can surface the failure.
        setState(null);
        throw err;
      }),
  );
  setStore('blocks', s.blockId, {
    content: s.content,
    updated_at: nowIso,
  });
  await track(
    repo.saveBlock(unwrap(store.blocks[s.blockId]), documentId).catch(() => undefined),
  );
  setState(null);
}
