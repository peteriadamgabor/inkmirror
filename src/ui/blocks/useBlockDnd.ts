/**
 * Drag-and-drop reordering for a block. Manages the source's "in flight"
 * data attribute and the target's drop-side indicator, and dispatches
 * the actual move via `moveBlockToPosition` once the user releases.
 *
 * Returns a bag of handlers the caller wires onto its wrapper element
 * plus an internal handle the contenteditable element uses to mirror
 * the same drop logic (so contenteditable's default text-drop doesn't
 * eat the event).
 */

import { moveBlockToPosition, store } from '@/store/document';
import type { Block } from '@/types';

export const DRAG_MIME = 'application/x-inkmirror-block-id';

export interface DndHandlers {
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  /** Re-flash the wrapper after a keyboard-driven move-up/move-down. */
  flashMoved: () => void;
}

interface Args {
  block: Block;
  /** Function that returns the current wrapper element. Lazy because the
   *  ref is set after the component runs. */
  wrapper: () => HTMLDivElement | undefined;
}

export function useBlockDnd({ block, wrapper }: Args): DndHandlers {
  const onDragStart = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, block.id);
    // A subtle visual: dim the source while it's in flight.
    wrapper()?.setAttribute('data-dragging', '1');
  };

  const onDragEnd = () => {
    const w = wrapper();
    w?.removeAttribute('data-dragging');
    w?.removeAttribute('data-drop-before');
    w?.removeAttribute('data-drop-after');
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    const w = wrapper();
    if (!w) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Pick a side based on the pointer's vertical position inside the row.
    const rect = w.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    w.setAttribute(before ? 'data-drop-before' : 'data-drop-after', '1');
    w.removeAttribute(before ? 'data-drop-after' : 'data-drop-before');
  };

  const onDragLeave = () => {
    const w = wrapper();
    w?.removeAttribute('data-drop-before');
    w?.removeAttribute('data-drop-after');
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    const w = wrapper();
    if (!w) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData(DRAG_MIME);
    w.removeAttribute('data-drop-before');
    w.removeAttribute('data-drop-after');
    if (!sourceId || sourceId === block.id) return;
    const rect = w.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const targetIdx = store.blockOrder.indexOf(block.id);
    if (targetIdx < 0) return;
    const insertAt = before ? targetIdx : targetIdx + 1;
    moveBlockToPosition(sourceId, insertAt);
  };

  const flashMoved = () => {
    // Solid's For re-renders visible blocks while the store mutates, so
    // the wrapper ref may not point at the same DOM node right after
    // a move. Query fresh from the block id to be safe.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-block-id="${block.id}"]`,
      );
      if (!el) return;
      el.dataset.justMoved = '1';
      setTimeout(() => delete el.dataset.justMoved, 350);
    });
  };

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, flashMoved };
}
