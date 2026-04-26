import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { uiState, setSearchOpen } from '@/store/ui-state';
import { store, setActiveChapter, updateBlockContent } from '@/store/document';
import { allVisibleBlocks } from '@/store/selectors';
import { t } from '@/i18n';
import { IconChevron, IconClose, IconSearch } from '@/ui/shared/icons';
import { shiftMarksForReplace } from '@/utils/replace-marks';
import type { UUID } from '@/types';

interface SearchHit {
  blockId: UUID;
  chapterId: UUID;
  start: number;
  end: number;
}

const MIN_QUERY_LEN = 2;
const FALLBACK_BLOCK_HEIGHT = 400;
const HIGHLIGHT_NAME = 'inkmirror-search-match';
const HIGHLIGHT_DURATION_MS = 1400;

function findHits(query: string): SearchHit[] {
  if (query.length < MIN_QUERY_LEN) return [];
  const q = query.toLowerCase();
  const out: SearchHit[] = [];
  for (const b of allVisibleBlocks()) {
    if (b.type === 'note') continue; // notes don't ship; don't search them.
    const lc = b.content.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lc.indexOf(q, from);
      if (idx < 0) break;
      out.push({
        blockId: b.id,
        chapterId: b.chapter_id,
        start: idx,
        end: idx + q.length,
      });
      from = idx + q.length;
    }
  }
  return out;
}

function flashBlock(blockId: UUID): void {
  const target = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (!target) return;
  target.dataset.searchFlash = '1';
  setTimeout(() => {
    delete target.dataset.searchFlash;
  }, 1200);
}

/**
 * Highlight the matched substring inside the rendered block via the
 * CSS Custom Highlight API. Non-destructive — does not touch the DOM
 * text content, so it can't fight contenteditable's caret. Falls back
 * gracefully on engines that don't support `CSS.highlights` (the block
 * still flashes its border ring, so the user isn't lost).
 */
function highlightMatch(blockId: UUID, matchStart: number, matchEnd: number): void {
  type HighlightCtor = new (...ranges: Range[]) => unknown;
  type HighlightRegistry = Map<string, unknown>;
  type CSSWithHighlights = typeof CSS & {
    highlights?: HighlightRegistry;
  };
  const cssExtended: CSSWithHighlights | undefined =
    typeof CSS !== 'undefined' ? (CSS as CSSWithHighlights) : undefined;
  const HighlightImpl = (window as unknown as { Highlight?: HighlightCtor })
    .Highlight;
  if (!cssExtended?.highlights || !HighlightImpl) return;

  const target = document.querySelector<HTMLElement>(
    `[data-block-id="${blockId}"] [data-editable]`,
  );
  if (!target) return;

  const range = document.createRange();
  let walked = 0;
  let startSet = false;
  let endSet = false;

  const walk = (node: Node): void => {
    if (endSet) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (!startSet && matchStart <= walked + len) {
        range.setStart(node, matchStart - walked);
        startSet = true;
      }
      if (startSet && matchEnd <= walked + len) {
        range.setEnd(node, matchEnd - walked);
        endSet = true;
      }
      walked += len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        walk(child);
        if (endSet) return;
      }
    }
  };
  walk(target);

  if (!startSet || !endSet) return;
  const highlight = new HighlightImpl(range);
  cssExtended.highlights.set(HIGHLIGHT_NAME, highlight);
  setTimeout(() => {
    cssExtended.highlights?.delete(HIGHLIGHT_NAME);
  }, HIGHLIGHT_DURATION_MS);
}

/**
 * Center the matched block in the editor viewport. Two-pass scroll is
 * needed because the editor is virtualized — if the match is far below
 * the current scroll position, the block isn't in the DOM yet, so we
 * pre-scroll using stored measurements to coax the virtualizer into
 * rendering it, then fine-tune with scrollIntoView on the next frame.
 */
function jumpTo(hit: SearchHit): void {
  setActiveChapter(hit.chapterId);
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      `[data-block-id="${hit.blockId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashBlock(hit.blockId);
      highlightMatch(hit.blockId, hit.start, hit.end);
      return;
    }
    const scroller = document.querySelector<HTMLElement>(
      '[data-scroll-root="editor"]',
    );
    if (!scroller) return;
    const order = store.blockOrder.filter(
      (id) => store.blocks[id]?.chapter_id === hit.chapterId,
    );
    const idx = order.indexOf(hit.blockId);
    if (idx < 0) return;
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      offset += store.measurements[order[i]]?.height ?? FALLBACK_BLOCK_HEIGHT;
    }
    scroller.scrollTop = Math.max(0, offset - scroller.clientHeight / 2);
    requestAnimationFrame(() => {
      const t2 = document.querySelector<HTMLElement>(
        `[data-block-id="${hit.blockId}"]`,
      );
      if (t2) {
        t2.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashBlock(hit.blockId);
        highlightMatch(hit.blockId, hit.start, hit.end);
      }
    });
  });
}

function applyReplacement(hit: SearchHit, replacement: string): void {
  const block = store.blocks[hit.blockId];
  if (!block) return;
  const next =
    block.content.slice(0, hit.start) +
    replacement +
    block.content.slice(hit.end);
  const nextMarks = shiftMarksForReplace(
    block.marks,
    hit.start,
    hit.end,
    replacement.length,
  );
  updateBlockContent(hit.blockId, next, { marks: nextMarks });
}

export const EditorSearch = () => {
  const [query, setQuery] = createSignal('');
  const [replacement, setReplacement] = createSignal('');
  const [cursor, setCursor] = createSignal(0);
  let inputEl: HTMLInputElement | undefined;

  const hits = createMemo(() => findHits(query()));

  // Reset state and focus input each time the bar opens.
  createEffect(() => {
    if (uiState.searchOpen) {
      setQuery('');
      setReplacement('');
      setCursor(0);
      queueMicrotask(() => inputEl?.focus());
    }
  });

  // Whenever the active match changes, jump to it.
  createEffect(() => {
    if (!uiState.searchOpen) return;
    const list = hits();
    if (list.length === 0) return;
    const i = Math.min(cursor(), list.length - 1);
    jumpTo(list[i]);
  });

  const next = () => {
    const list = hits();
    if (list.length === 0) return;
    setCursor((i) => (i + 1) % list.length);
  };

  const prev = () => {
    const list = hits();
    if (list.length === 0) return;
    setCursor((i) => (i - 1 + list.length) % list.length);
  };

  const close = () => setSearchOpen(false);

  const replaceCurrent = () => {
    const list = hits();
    if (list.length === 0) return;
    const i = Math.min(cursor(), list.length - 1);
    applyReplacement(list[i], replacement());
    // The hits memo recomputes off store.blocks; the new list may be
    // shorter or shifted. Keep the cursor pointing at the same index
    // so the user advances naturally through subsequent matches.
    queueMicrotask(() => {
      const after = hits().length;
      if (after === 0) {
        setCursor(0);
        return;
      }
      setCursor((c) => Math.min(c, after - 1));
    });
  };

  const replaceAll = () => {
    const list = hits();
    if (list.length === 0) return;
    // Group by block id and walk RIGHT-to-LEFT inside each block so
    // earlier offsets stay valid as later matches are spliced. Across
    // blocks the order doesn't matter — each block is independent.
    const byBlock = new Map<UUID, SearchHit[]>();
    for (const h of list) {
      const arr = byBlock.get(h.blockId) ?? [];
      arr.push(h);
      byBlock.set(h.blockId, arr);
    }
    for (const arr of byBlock.values()) {
      arr.sort((a, b) => b.start - a.start);
      for (const h of arr) applyReplacement(h, replacement());
    }
    setCursor(0);
  };

  const onSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      prev();
    }
  };

  const onReplaceKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) replaceAll();
      else replaceCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const counterText = () => {
    const list = hits();
    if (list.length > 0) {
      return t('search.counter', {
        current: Math.min(cursor() + 1, list.length),
        total: list.length,
      });
    }
    if (query().length < MIN_QUERY_LEN) return '';
    return t('search.empty');
  };

  return (
    <Show when={uiState.searchOpen}>
      <div
        class="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-[560px] max-w-[92vw] flex flex-col gap-2 px-3 py-2 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl"
        data-search-bar
      >
        <div class="flex items-center gap-2">
          <IconSearch size={14} class="text-stone-400 shrink-0" />
          <input
            ref={inputEl}
            type="text"
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setCursor(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t('search.placeholder')}
            class="flex-1 min-w-0 bg-transparent outline-none text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400"
            aria-label={t('search.placeholder')}
          />
          <span
            class="text-[10px] tabular-nums text-stone-500 shrink-0 min-w-[3.5rem] text-right"
            data-testid="search-counter"
          >
            {counterText()}
          </span>
          <button
            type="button"
            onClick={prev}
            disabled={hits().length === 0}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 disabled:opacity-30 transition-colors"
            title={t('search.prev')}
            aria-label={t('search.prev')}
          >
            <IconChevron size={12} class="rotate-180" />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={hits().length === 0}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 disabled:opacity-30 transition-colors"
            title={t('search.next')}
            aria-label={t('search.next')}
          >
            <IconChevron size={12} />
          </button>
          <button
            type="button"
            onClick={close}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 transition-colors"
            title={t('search.close')}
            aria-label={t('search.close')}
          >
            <IconClose size={12} />
          </button>
        </div>
        <div class="flex items-center gap-2 pl-[22px]">
          <input
            type="text"
            value={replacement()}
            onInput={(e) => setReplacement(e.currentTarget.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder={t('search.replacePlaceholder')}
            class="flex-1 min-w-0 bg-transparent outline-none text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 border-b border-stone-200/60 dark:border-stone-700/40 focus:border-violet-400"
            aria-label={t('search.replacePlaceholder')}
            data-testid="search-replace-input"
          />
          <button
            type="button"
            onClick={replaceCurrent}
            disabled={hits().length === 0}
            class="text-[11px] px-2 py-0.5 rounded text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors"
            title={t('search.replaceTitle')}
            data-testid="search-replace-one"
          >
            {t('search.replace')}
          </button>
          <button
            type="button"
            onClick={replaceAll}
            disabled={hits().length === 0}
            class="text-[11px] px-2 py-0.5 rounded text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors"
            title={t('search.replaceAllTitle')}
            data-testid="search-replace-all"
          >
            {t('search.replaceAll')}
          </button>
        </div>
      </div>
    </Show>
  );
};
