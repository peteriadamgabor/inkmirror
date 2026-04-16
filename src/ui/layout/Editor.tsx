import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { BlockView } from '@/ui/blocks/BlockView';
import { StoryPulseEcg } from '@/ui/features/StoryPulseEcg';
import { computeVisible } from '@/engine/virtualizer';
import { createMemoizedMeasurer, createPretextMeasurer } from '@/engine/measure';
import { store, setViewport, setMeasurement, saveState, renameChapter } from '@/store/document';
import { useTheme } from '@/ui/theme';
import { uiState, toggleSpellcheck, toggleDocumentSettings } from '@/store/ui-state';
import { getSonificationEngine, type MoodLabel } from '@/audio/engine';
import { IconSun, IconMoon, IconSpellcheck, IconVolume } from '@/ui/shared/icons';
import type { Block } from '@/types';

const EDITOR_WIDTH = 680;
const EDITOR_FONT = '16px Georgia, serif';
const LINE_HEIGHT = 1.8;
const OVERSCAN = 5;

// The transformed slice used to have padding: 24px which caused:
//   (a) content width < EDITOR_WIDTH → pretext under-measured
//   (b) 48px of vertical space not counted in totalHeight.
// Padding now lives on the scroll container instead.
const SCROLL_PADDING = 24;

// Conservative estimate for a block's non-content chrome (py-2, label div, margin).
// Only used as an initial guess until ResizeObserver reports the real DOM height.
const BLOCK_CHROME_PX = 32;

// Initial height estimate for blocks that haven't been measured yet. Chosen
// to be slightly LARGER than a typical 200-word Georgia paragraph so that the
// total scroll range starts too big and ResizeObserver shrinks it, which is
// visually less jarring than growth.
const INITIAL_BLOCK_HEIGHT = 400;

const measurer = createMemoizedMeasurer(createPretextMeasurer());

function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

export const Editor = () => {
  let scrollEl!: HTMLDivElement;
  let ticking = false;

  // Derived: only blocks belonging to the active chapter. The raw
  // store.blockOrder still tracks the whole document; this memo is what
  // the virtualizer, scroll anchor, and <For> render off of.
  const activeOrder = createMemo(() => {
    const activeId = store.activeChapterId;
    if (!activeId) return store.blockOrder.slice();
    return store.blockOrder.filter((id) => store.blocks[id]?.chapter_id === activeId);
  });

  // Initial measurement pass: use pretext as a hint, but FLOOR at the
  // INITIAL_BLOCK_HEIGHT estimate so the scrollbar starts too big rather
  // than too small. ResizeObserver then shrinks measurements to match the
  // real rendered DOM. Shrinkage is visually less jarring than growth.
  createEffect(() => {
    const order = store.blockOrder;
    for (const id of order) {
      const block = store.blocks[id];
      if (!block) continue;
      const hash = contentHash(block.content);
      const cached = store.measurements[id];
      if (cached && cached.contentHash === hash) continue;
      let estimate = INITIAL_BLOCK_HEIGHT;
      try {
        const result = measurer.measure({
          text: block.content,
          font: EDITOR_FONT,
          width: EDITOR_WIDTH,
          lineHeight: LINE_HEIGHT,
        });
        estimate = Math.max(INITIAL_BLOCK_HEIGHT, result.height + BLOCK_CHROME_PX);
      } catch {
        /* fall through to INITIAL_BLOCK_HEIGHT */
      }
      setMeasurement(id, { height: estimate, contentHash: hash });
    }
  });

  // Find which block currently sits at the top of the viewport and at what
  // intra-block offset. Used by scroll anchoring so measurement changes do
  // not shift the visible content under the user's cursor.
  function captureAnchor(): { index: number; offsetWithinBlock: number } | null {
    if (!scrollEl) return null;
    const scrollTop = scrollEl.scrollTop;
    let accTop = 0;
    const order = activeOrder();
    for (let i = 0; i < order.length; i++) {
      const h = store.measurements[order[i]]?.height ?? INITIAL_BLOCK_HEIGHT;
      if (accTop + h > scrollTop) {
        return { index: i, offsetWithinBlock: scrollTop - accTop };
      }
      accTop += h;
    }
    return null;
  }

  function restoreAnchor(anchor: { index: number; offsetWithinBlock: number }): void {
    if (!scrollEl) return;
    let accTop = 0;
    const order = activeOrder();
    for (let i = 0; i < anchor.index && i < order.length; i++) {
      accTop += store.measurements[order[i]]?.height ?? INITIAL_BLOCK_HEIGHT;
    }
    scrollEl.scrollTop = accTop + anchor.offsetWithinBlock;
  }

  // Source-of-truth measurement: observe every rendered block and record its
  // real DOM height. This overrides pretext estimates as soon as a block is
  // actually laid out by the browser. Scroll anchoring prevents the visible
  // content from drifting when measurements change.
  let ro: ResizeObserver | null = null;
  const observed = new WeakSet<Element>();

  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver((entries) => {
      const anchor = captureAnchor();
      let anyChange = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = el.dataset.blockId;
        if (!id) continue;
        const height = Math.round(entry.contentRect.height);
        if (height <= 0) continue;
        const existing = store.measurements[id];
        if (existing && Math.abs(existing.height - height) < 0.5) continue;
        const block = store.blocks[id];
        const hash = block ? contentHash(block.content) : existing?.contentHash ?? '';
        setMeasurement(id, { height, contentHash: hash });
        anyChange = true;
      }
      if (anyChange && anchor) {
        // Restore after Solid has committed the reactive updates.
        queueMicrotask(() => restoreAnchor(anchor));
      }
    });
  });

  onCleanup(() => {
    ro?.disconnect();
    ro = null;
  });

  const orderedHeights = createMemo(() =>
    activeOrder().map((id) => store.measurements[id]?.height ?? 0),
  );

  const visible = createMemo(() =>
    computeVisible({
      blockHeights: orderedHeights(),
      scrollTop: store.viewport.scrollTop,
      viewportHeight: store.viewport.viewportHeight,
      overscan: OVERSCAN,
    }),
  );

  const visibleBlocks = createMemo<Block[]>(() => {
    const v = visible();
    if (v.lastIndex < v.firstIndex) return [];
    const ids = activeOrder().slice(v.firstIndex, v.lastIndex + 1);
    return ids.map((id) => store.blocks[id]).filter((b): b is Block => Boolean(b));
  });

  // Re-observe rendered blocks whenever the visible slice changes.
  createEffect(() => {
    visibleBlocks(); // reactive dependency
    if (!ro) return;
    queueMicrotask(() => {
      if (!ro) return;
      const els = document.querySelectorAll<HTMLElement>('[data-block-id]');
      els.forEach((el) => {
        if (observed.has(el)) return;
        ro!.observe(el);
        observed.add(el);
      });
    });
  });

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
      ticking = false;
    });
  };

  createEffect(() => {
    if (scrollEl) setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
  });

  const activeChapterKind = createMemo(() => {
    const id = store.activeChapterId;
    if (!id) return 'standard';
    return store.chapters.find((c) => c.id === id)?.kind ?? 'standard';
  });

  const { theme, toggleTheme } = useTheme();
  const sono = getSonificationEngine();
  const [sonoOn, setSonoOn] = createSignal(false);

  const docTitle = () => store.document?.title || 'Untitled';
  const chapterTitle = () => {
    const id = store.activeChapterId;
    if (!id) return '';
    return store.chapters.find((c) => c.id === id)?.title ?? '';
  };

  const [editingChapter, setEditingChapter] = createSignal(false);
  const [chapterDraft, setChapterDraft] = createSignal('');

  const startChapterEdit = () => {
    setChapterDraft(chapterTitle());
    setEditingChapter(true);
  };

  const commitChapterEdit = () => {
    const id = store.activeChapterId;
    if (id && chapterDraft().trim()) {
      renameChapter(id, chapterDraft());
    }
    setEditingChapter(false);
  };

  const toggleSono = async () => {
    if (sonoOn()) {
      sono.stop();
      setSonoOn(false);
    } else {
      try {
        await sono.start('neutral' as MoodLabel);
        setSonoOn(true);
      } catch {
        /* silent */
      }
    }
  };

  return (
    <div class="h-full flex flex-col bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden">
      <div class="flex items-center px-3 py-1.5 border-b border-stone-200/50 dark:border-stone-700/30 shrink-0 gap-2">
        {/* Left: toolbar icons */}
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme() === 'dark' ? 'Switch to light' : 'Switch to dark'}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 transition-colors"
          >
            {theme() === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
          </button>
          <button
            type="button"
            onClick={toggleSpellcheck}
            title={`Spellcheck: ${uiState.spellcheck ? 'on' : 'off'}`}
            class="w-6 h-6 flex items-center justify-center rounded transition-colors"
            classList={{
              'text-violet-500': uiState.spellcheck,
              'text-stone-400 hover:text-violet-500': !uiState.spellcheck,
            }}
          >
            <IconSpellcheck size={14} />
          </button>
          <button
            type="button"
            onClick={() => void toggleSono()}
            title={sonoOn() ? 'Stop ambient tone' : 'Play ambient tone'}
            class="w-6 h-6 flex items-center justify-center rounded transition-colors"
            classList={{
              'text-violet-500': sonoOn(),
              'text-stone-400 hover:text-violet-500': !sonoOn(),
            }}
          >
            <IconVolume size={14} />
          </button>
        </div>

        {/* Center: doc title / chapter — clickable */}
        <div class="flex-1 flex items-center justify-center min-w-0">
          <button
            type="button"
            onClick={() => toggleDocumentSettings()}
            title="Edit document settings"
            class="text-[11px] text-stone-500 dark:text-stone-400 hover:text-violet-500 truncate transition-colors"
          >
            {docTitle()}
          </button>
          <Show when={chapterTitle()}>
            <span class="text-stone-300 dark:text-stone-600 mx-1 text-[11px]">/</span>
            <Show
              when={editingChapter()}
              fallback={
                <button
                  type="button"
                  onClick={startChapterEdit}
                  title="Click to rename chapter"
                  class="text-[11px] text-stone-500 dark:text-stone-400 hover:text-violet-500 truncate transition-colors"
                >
                  {chapterTitle()}
                </button>
              }
            >
              <input
                type="text"
                value={chapterDraft()}
                onInput={(e) => setChapterDraft(e.currentTarget.value)}
                onBlur={commitChapterEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitChapterEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditingChapter(false); }
                }}
                ref={(el) => queueMicrotask(() => { el.focus(); el.select(); })}
                class="text-[11px] bg-transparent outline-none border-b border-violet-500 text-stone-700 dark:text-stone-200 w-[120px] text-center"
              />
            </Show>
          </Show>
        </div>

        {/* Right: save state */}
        <div class="w-[60px] text-right shrink-0">
          <Show when={saveState() !== 'idle'}>
            <span class="text-[10px] text-stone-400">
              {saveState() === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          </Show>
        </div>
      </div>
      <StoryPulseEcg />
      <div
        ref={scrollEl}
        onScroll={onScroll}
        data-scroll-root="editor"
        data-chapter-kind={activeChapterKind()}
        class="flex-1 overflow-auto"
        style={{ 'padding-top': `${SCROLL_PADDING}px`, 'padding-bottom': `${SCROLL_PADDING}px` }}
      >
        <div
          style={{
            height: `${visible().totalHeight}px`,
            position: 'relative',
            'max-width': `${EDITOR_WIDTH}px`,
            'margin-left': 'auto',
            'margin-right': 'auto',
          }}
        >
          <div style={{ transform: `translateY(${visible().offsetTop}px)` }}>
            <For each={visibleBlocks()} fallback={<div class="p-8 text-stone-500">No document loaded</div>}>
              {(block) => <BlockView block={block} />}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
