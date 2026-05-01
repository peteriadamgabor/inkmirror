import { createSignal } from 'solid-js';
import type { UUID } from '@/types';

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
