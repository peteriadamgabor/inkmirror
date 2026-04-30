import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { pendingSlashMenu, resolveSlashMenu } from './slashMenu';
import { slashMenuItems, filterSlashItems } from '@/ui/blocks/slash-menu-items';

const MENU_WIDTH = 260;

export const SlashMenuHost = () => {
  const [filter, setFilter] = createSignal('');
  const [focusedIdx, setFocusedIdx] = createSignal(0);
  let menuEl: HTMLDivElement | undefined;

  // Reset filter + selection every time the menu re-opens.
  createEffect(() => {
    if (pendingSlashMenu()) {
      setFilter('');
      setFocusedIdx(0);
    }
  });

  const visible = createMemo(() => filterSlashItems(slashMenuItems(), filter()));

  const moveFocus = (step: 1 | -1) => {
    const items = visible();
    if (items.length === 0) return;
    const next = (focusedIdx() + step + items.length) % items.length;
    setFocusedIdx(next);
  };

  const applySelected = () => {
    const items = visible();
    const idx = focusedIdx();
    if (idx < 0 || idx >= items.length) {
      resolveSlashMenu(null);
      return;
    }
    resolveSlashMenu(items[idx].type);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!pendingSlashMenu()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveSlashMenu(null);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      applySelected();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const current = filter();
      if (current.length === 0) {
        resolveSlashMenu(null);
      } else {
        setFilter(current.slice(0, -1));
        setFocusedIdx(0);
      }
      return;
    }
    // Typed letters extend the prefix filter. Keep to printable ASCII
    // so arrow keys, modifier keys, etc. don't leak into the filter.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setFilter(filter() + e.key);
      setFocusedIdx(0);
    }
  };

  const onDocumentClick = (e: MouseEvent) => {
    if (!pendingSlashMenu()) return;
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
    resolveSlashMenu(null);
  };

  const onScrollOrResize = () => {
    if (pendingSlashMenu()) resolveSlashMenu(null);
  };

  onMount(() => {
    // Capture-phase keydown so we beat the block's contenteditable handler.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDocumentClick, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('wheel', onScrollOrResize, { passive: true });
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onDocumentClick, true);
    window.removeEventListener('resize', onScrollOrResize);
    window.removeEventListener('wheel', onScrollOrResize);
  });

  const position = () => {
    const state = pendingSlashMenu();
    if (!state) return { left: '0px', top: '0px' };
    const { x, y } = state.anchor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(x, vw - MENU_WIDTH - 8));
    // Rough height: header + up to 4 rows × ~56px + filter row.
    const approxH = 280;
    const top = y + approxH > vh - 8 ? Math.max(8, y - approxH - 8) : y;
    return { left: `${left}px`, top: `${top}px` };
  };

  return (
    <Show when={pendingSlashMenu()}>
      <div
        ref={menuEl}
        class="fixed z-50 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-2xl p-1"
        style={{ ...position(), width: `${MENU_WIDTH}px` }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="px-2 pt-2 pb-1 text-[10px] inkmirror-smallcaps text-stone-400 flex items-center gap-2">
          <span>Block type</span>
          <Show when={filter()}>
            <span class="font-mono text-stone-500 normal-case">/{filter()}</span>
          </Show>
        </div>
        <Show
          when={visible().length > 0}
          fallback={
            <div class="px-2 py-3 text-xs text-stone-400 italic">No match</div>
          }
        >
          <For each={visible()}>
            {(item, i) => (
              <button
                type="button"
                onMouseEnter={() => setFocusedIdx(i())}
                onClick={() => resolveSlashMenu(item.type)}
                class="w-full flex flex-col items-start gap-0.5 text-left px-2 py-1.5 rounded-md transition-colors"
                classList={{
                  'bg-stone-100 dark:bg-stone-700': focusedIdx() === i(),
                }}
                role="menuitem"
              >
                <span class="text-xs font-medium text-stone-700 dark:text-stone-200">
                  {item.label}
                </span>
                <span class="text-[10px] text-stone-400 leading-snug">
                  {item.hint}
                </span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
};
