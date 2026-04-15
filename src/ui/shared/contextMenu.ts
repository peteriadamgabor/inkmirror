import { createSignal } from 'solid-js';

export interface ContextMenuItem {
  kind?: 'item' | 'divider' | 'header';
  label?: string;
  description?: string;
  hint?: string; // right-aligned muted text (keybinding, check mark, …)
  disabled?: boolean;
  danger?: boolean;
  active?: boolean; // shows a · prefix for "current value" rows
  onSelect?: () => void;
}

export interface ContextMenuState {
  anchor: { x: number; y: number; align?: 'left' | 'right' };
  items: ContextMenuItem[];
}

const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);
export { contextMenu };

/**
 * Open a menu anchored at the given screen coordinates. Any currently-open
 * menu is replaced — only one context menu exists at a time globally.
 */
export function openContextMenu(state: ContextMenuState): void {
  setContextMenu(state);
}

export function closeContextMenu(): void {
  setContextMenu(null);
}

/**
 * Convenience: open anchored to an element's bounding rect, below by default.
 */
export function openContextMenuAt(
  el: Element,
  items: ContextMenuItem[],
  opts: { align?: 'left' | 'right'; below?: boolean } = {},
): void {
  const rect = el.getBoundingClientRect();
  const align = opts.align ?? 'left';
  const x = align === 'right' ? rect.right : rect.left;
  const y = (opts.below ?? true) ? rect.bottom + 4 : rect.top;
  openContextMenu({ anchor: { x, y, align }, items });
}
