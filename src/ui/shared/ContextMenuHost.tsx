import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { contextMenu, closeContextMenu } from './contextMenu';

const MENU_WIDTH = 220;

export const ContextMenuHost = () => {
  const [focusedIdx, setFocusedIdx] = createSignal(-1);
  let menuEl: HTMLDivElement | undefined;

  const selectableIndices = () => {
    const items = contextMenu()?.items ?? [];
    const out: number[] = [];
    items.forEach((it, i) => {
      if ((it.kind ?? 'item') === 'item' && !it.disabled) out.push(i);
    });
    return out;
  };

  // Reset focus whenever the menu content changes.
  createEffect(() => {
    const state = contextMenu();
    if (!state) {
      setFocusedIdx(-1);
      return;
    }
    // Focus first selectable so arrow keys work without an initial click.
    const selectable = selectableIndices();
    setFocusedIdx(selectable[0] ?? -1);
  });

  const moveFocus = (step: 1 | -1) => {
    const selectable = selectableIndices();
    if (selectable.length === 0) return;
    const current = focusedIdx();
    const pos = selectable.indexOf(current);
    const nextPos =
      pos === -1
        ? 0
        : (pos + step + selectable.length) % selectable.length;
    setFocusedIdx(selectable[nextPos]);
  };

  const runSelected = () => {
    const items = contextMenu()?.items ?? [];
    const idx = focusedIdx();
    if (idx < 0 || idx >= items.length) return;
    const item = items[idx];
    if ((item.kind ?? 'item') !== 'item' || item.disabled) return;
    item.onSelect?.();
    closeContextMenu();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!contextMenu()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeContextMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected();
    }
  };

  const onDocumentClick = (e: MouseEvent) => {
    if (!contextMenu()) return;
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
    closeContextMenu();
  };

  const onScrollOrResize = () => {
    // Menus are anchored to viewport coordinates; on scroll they'd drift.
    // Simplest behavior: dismiss.
    if (contextMenu()) closeContextMenu();
  };

  onMount(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDocumentClick, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('wheel', onScrollOrResize, { passive: true });
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousedown', onDocumentClick, true);
    window.removeEventListener('resize', onScrollOrResize);
    window.removeEventListener('wheel', onScrollOrResize);
  });

  const position = () => {
    const state = contextMenu();
    if (!state) return { left: '0px', top: '0px' };
    const { x, y, align } = state.anchor;
    // Flip horizontally if the menu would run off the right edge.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferredLeft = align === 'right' ? x - MENU_WIDTH : x;
    const left = Math.max(8, Math.min(preferredLeft, vw - MENU_WIDTH - 8));
    // Vertical: if anchor y + guess > vh, flip above.
    const approxH = (state.items.length + 1) * 32;
    const top = y + approxH > vh - 8 ? Math.max(8, y - approxH - 8) : y;
    return { left: `${left}px`, top: `${top}px` };
  };

  return (
    <Show when={contextMenu()}>
      {(state) => (
        <div
          ref={menuEl}
          class="fixed z-50 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-2xl p-1"
          style={{ ...position(), width: `${MENU_WIDTH}px` }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <For each={state().items}>
            {(item, i) => {
              const kind = item.kind ?? 'item';
              if (kind === 'divider') {
                return <div class="h-px bg-stone-200 dark:bg-stone-700 my-1 mx-1" />;
              }
              if (kind === 'header') {
                return (
                  <div class="px-2 pt-2 pb-1 text-[10px] inkmirror-smallcaps text-stone-400">
                    {item.label}
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  disabled={item.disabled}
                  onMouseEnter={() => setFocusedIdx(i())}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onSelect?.();
                    closeContextMenu();
                  }}
                  class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  classList={{
                    'bg-stone-100 dark:bg-stone-700': focusedIdx() === i() && !item.disabled,
                    'text-red-500 hover:text-red-600': item.danger === true,
                    'text-stone-700 dark:text-stone-200': item.danger !== true,
                  }}
                  role="menuitem"
                >
                  <span class="flex items-center gap-2 min-w-0 truncate">
                    <span class="w-2 shrink-0 text-violet-500">
                      {item.active ? '·' : ''}
                    </span>
                    <span class="truncate">{item.label}</span>
                  </span>
                  <Show when={item.hint}>
                    <span class="font-mono text-[10px] text-stone-400 shrink-0">
                      {item.hint}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      )}
    </Show>
  );
};
