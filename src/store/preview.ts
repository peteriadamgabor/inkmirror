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

/**
 * Cancel the active preview if it belongs to the specified document.
 *
 * Returns true if a preview was cancelled (so the caller can surface a
 * user-visible notification). Used by the sync apply path: if a remote
 * update lands for the doc the user is mid-preview on, we drop the preview
 * — committing a Restore against a stale base would silently overwrite the
 * remote-updated content the user hasn't seen yet.
 *
 * Cross-doc previews aren't possible by design (only one doc is active at
 * a time, and preview is per-block in that active doc), so the doc-id
 * check is more of a defensive guard than a real branch.
 */
export function cancelPreviewIfDocMatches(docId: UUID): boolean {
  if (state() === null) return false;
  if (store.document?.id !== docId) return false;
  setState(null);
  return true;
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
