/**
 * Find/replace state hooks for the in-app search bar. Split out of
 * EditorSearch.tsx so the component file stays a thin render shell —
 * everything that touches blocks, the highlight registry, scroll
 * positioning, and replacement-mark math lives here.
 */

import {
  createEffect,
  createMemo,
  createSignal,
  type Accessor,
  type Setter,
} from 'solid-js';
import { setActiveChapter, store, updateBlockContent } from '@/store/document';
import { allVisibleBlocks } from '@/store/selectors';
import { uiState } from '@/store/ui-state';
import { shiftMarksForReplace } from '@/utils/replace-marks';
import { t } from '@/i18n';
import type { UUID } from '@/types';

export interface SearchHit {
  blockId: UUID;
  chapterId: UUID;
  start: number;
  end: number;
}

export const MIN_QUERY_LEN = 2;
const FALLBACK_BLOCK_HEIGHT = 400;
/** Subtle wash painted on every match in the rendered viewport. */
const HIGHLIGHT_ALL = 'inkmirror-search-match';
/** Stronger paint on the cursor's active match — sits on top of `_ALL`. */
const HIGHLIGHT_CURRENT = 'inkmirror-search-match-current';

type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightLike = { add(range: Range): void; clear?(): void };
type HighlightRegistry = Map<string, HighlightLike>;
type CSSWithHighlights = typeof CSS & { highlights?: HighlightRegistry };

function getHighlightApi():
  | { registry: HighlightRegistry; ctor: HighlightCtor }
  | null {
  if (typeof CSS === 'undefined') return null;
  const ext = CSS as CSSWithHighlights;
  const ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!ext.highlights || !ctor) return null;
  return { registry: ext.highlights, ctor };
}

/**
 * Inject the `::highlight()` paint rules on first use. Kept out of the
 * static CSS bundle because lightningcss doesn't recognize the functional
 * pseudo-element — it warns on parse and the sourcemap noise drowns out
 * real issues. Browsers without the API silently drop the rules.
 */
let highlightStyleInjected = false;
function ensureHighlightStyle(): void {
  if (highlightStyleInjected) return;
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.dataset.inkmirrorHighlight = '1';
  style.textContent = [
    // Lower priority on the all-matches wash so the current-match paint
    // wins when the two ranges overlap (which they do, by definition).
    `::highlight(${HIGHLIGHT_ALL}) { background-color: rgba(127, 119, 221, 0.18); color: inherit; }`,
    `::highlight(${HIGHLIGHT_CURRENT}) { background-color: rgba(127, 119, 221, 0.55); color: inherit; }`,
  ].join('\n');
  document.head.appendChild(style);
  highlightStyleInjected = true;
}

/**
 * Build a Range covering `[start, end)` of `target`'s plain-text content
 * by walking text nodes. Returns null if the offsets fall outside the
 * rendered text (block isn't rendered yet, marks were re-rendered, …).
 */
function rangeForOffsets(
  target: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const range = document.createRange();
  let walked = 0;
  let startSet = false;
  let endSet = false;

  const walk = (node: Node): void => {
    if (endSet) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (!startSet && start <= walked + len) {
        range.setStart(node, start - walked);
        startSet = true;
      }
      if (startSet && end <= walked + len) {
        range.setEnd(node, end - walked);
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
  return startSet && endSet ? range : null;
}

/** Clear both highlight buckets — called when the search bar closes
 *  so old paints don't linger over the editor. */
function clearHighlights(): void {
  const api = getHighlightApi();
  if (!api) return;
  api.registry.delete(HIGHLIGHT_ALL);
  api.registry.delete(HIGHLIGHT_CURRENT);
}

/**
 * Rebuild both highlight buckets from the current hits + cursor. Walks
 * each rendered block once (matches in non-rendered virtualizer blocks
 * are simply skipped — they paint when the block scrolls into view and
 * the next rebuild fires).
 */
function paintHighlights(hits: SearchHit[], cursor: number): void {
  const api = getHighlightApi();
  if (!api) return;
  ensureHighlightStyle();

  const allHl = new api.ctor() as HighlightLike;
  const currentHl = new api.ctor() as HighlightLike;
  const activeIdx = hits.length === 0 ? -1 : Math.min(cursor, hits.length - 1);

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const target = document.querySelector<HTMLElement>(
      `[data-block-id="${hit.blockId}"] [data-editable]`,
    );
    if (!target) continue; // virtualized — not in DOM right now.
    const range = rangeForOffsets(target, hit.start, hit.end);
    if (!range) continue;
    allHl.add(range);
    if (i === activeIdx) currentHl.add(range);
  }

  api.registry.set(HIGHLIGHT_ALL, allHl);
  api.registry.set(HIGHLIGHT_CURRENT, currentHl);
}

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
 * Center the matched block in the editor viewport. Two-pass scroll is
 * needed because the editor is virtualized — if the match is far below
 * the current scroll position, the block isn't in the DOM yet, so we
 * pre-scroll using stored measurements to coax the virtualizer into
 * rendering it, then fine-tune with scrollIntoView on the next frame.
 *
 * Highlighting is NOT done here — the `useSearch` effect repaints
 * every time hits or cursor change, so the active match is always lit
 * up by the time scrolling settles.
 */
function jumpTo(hit: SearchHit, onArrived?: () => void): void {
  setActiveChapter(hit.chapterId);
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      `[data-block-id="${hit.blockId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashBlock(hit.blockId);
      onArrived?.();
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
        onArrived?.();
      }
    });
  });
}

export interface SearchHandle {
  query: Accessor<string>;
  setQuery: Setter<string>;
  cursor: Accessor<number>;
  setCursor: Setter<number>;
  hits: Accessor<SearchHit[]>;
  next: () => void;
  prev: () => void;
  counterText: () => string;
  /** Reset query/cursor — called when the bar opens. */
  reset: () => void;
}

export function useSearch(): SearchHandle {
  const [query, setQuery] = createSignal('');
  const [cursor, setCursor] = createSignal(0);

  const hits = createMemo(() => findHits(query()));

  // Paint highlights any time hits or cursor change. When the bar
  // closes (or the query empties), clear so the violet wash doesn't
  // linger over the editor.
  createEffect(() => {
    if (!uiState.searchOpen) {
      clearHighlights();
      return;
    }
    const list = hits();
    if (list.length === 0) {
      clearHighlights();
      return;
    }
    paintHighlights(list, cursor());
  });

  // Whenever the active match changes, jump to it. Repaint after the
  // virtualizer renders the destination block — without the second
  // pass the new block has no DOM at the moment paintHighlights ran.
  createEffect(() => {
    if (!uiState.searchOpen) return;
    const list = hits();
    if (list.length === 0) return;
    const i = Math.min(cursor(), list.length - 1);
    jumpTo(list[i], () => paintHighlights(list, i));
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

  const reset = () => {
    setQuery('');
    setCursor(0);
  };

  return { query, setQuery, cursor, setCursor, hits, next, prev, counterText, reset };
}

export interface ReplaceHandle {
  replacement: Accessor<string>;
  setReplacement: Setter<string>;
  replaceCurrent: () => void;
  replaceAll: () => void;
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

export function useReplace(search: SearchHandle): ReplaceHandle {
  const [replacement, setReplacement] = createSignal('');

  const replaceCurrent = () => {
    const list = search.hits();
    if (list.length === 0) return;
    const i = Math.min(search.cursor(), list.length - 1);
    applyReplacement(list[i], replacement());
    // The hits memo recomputes off store.blocks; the new list may be
    // shorter or shifted. Keep the cursor pointing at the same index
    // so the user advances naturally through subsequent matches.
    queueMicrotask(() => {
      const after = search.hits().length;
      if (after === 0) {
        search.setCursor(0);
        return;
      }
      search.setCursor((c) => Math.min(c, after - 1));
    });
  };

  const replaceAll = () => {
    const list = search.hits();
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
    search.setCursor(0);
  };

  return { replacement, setReplacement, replaceCurrent, replaceAll };
}
