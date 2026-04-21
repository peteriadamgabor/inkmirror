import { createSignal } from 'solid-js';
import type { BlockType } from '@/types';

export interface PendingSlashMenu {
  anchor: { x: number; y: number };
  resolve: (blockType: BlockType | null) => void;
}

const [pending, setPending] = createSignal<PendingSlashMenu | null>(null);
export { pending as pendingSlashMenu };

/**
 * Open the block slash menu anchored at the given screen coordinates.
 * Resolves with the picked BlockType, or null if dismissed.
 */
export function openSlashMenu(anchor: { x: number; y: number }): Promise<BlockType | null> {
  const current = pending();
  if (current) current.resolve(null);
  return new Promise((resolve) => {
    setPending({ anchor, resolve });
  });
}

export function resolveSlashMenu(value: BlockType | null): void {
  const current = pending();
  if (!current) return;
  setPending(null);
  current.resolve(value);
}
