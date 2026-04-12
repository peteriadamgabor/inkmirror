import { createEffect, createMemo, For } from 'solid-js';
import { BlockView } from '@/ui/blocks/BlockView';
import { computeVisible } from '@/engine/virtualizer';
import { createMemoizedMeasurer, createPretextMeasurer } from '@/engine/measure';
import { store, setViewport, setMeasurement } from '@/store/document';
import type { Block } from '@/types';

const EDITOR_WIDTH = 680;
const EDITOR_FONT = '16px Georgia, serif';
const LINE_HEIGHT = 1.8;
const OVERSCAN = 5;

const measurer = createMemoizedMeasurer(createPretextMeasurer());

function contentHash(s: string): string {
  // djb2 — fast, deterministic, good enough for cache keys
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

export const Editor = () => {
  let scrollEl!: HTMLDivElement;
  let ticking = false;

  // Measure any block whose content or hash is new or stale.
  createEffect(() => {
    const order = store.blockOrder;
    for (const id of order) {
      const block = store.blocks[id];
      if (!block) continue;
      const hash = contentHash(block.content);
      const cached = store.measurements[id];
      if (cached && cached.contentHash === hash) continue;
      try {
        const result = measurer.measure({
          text: block.content,
          font: EDITOR_FONT,
          width: EDITOR_WIDTH,
          lineHeight: LINE_HEIGHT,
        });
        setMeasurement(id, { height: result.height, contentHash: hash });
      } catch (err) {
        // pretext may throw in non-browser contexts (e.g. test runners).
        // Fall back to a conservative default so virtualization still works.
        const fallback = 80;
        setMeasurement(id, { height: fallback, contentHash: hash });
      }
    }
  });

  const orderedHeights = createMemo(() =>
    store.blockOrder.map((id) => store.measurements[id]?.height ?? 0),
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
    const ids = store.blockOrder.slice(v.firstIndex, v.lastIndex + 1);
    return ids.map((id) => store.blocks[id]).filter((b): b is Block => Boolean(b));
  });

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
      ticking = false;
    });
  };

  // Set the initial viewport height after mount.
  createEffect(() => {
    if (scrollEl) setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
  });

  return (
    <div
      ref={scrollEl}
      onScroll={onScroll}
      class="h-full overflow-auto bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700"
    >
      <div style={{ height: `${visible().totalHeight}px`, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visible().offsetTop}px)`,
            'max-width': `${EDITOR_WIDTH}px`,
            'margin-left': 'auto',
            'margin-right': 'auto',
            padding: '24px',
          }}
        >
          <For each={visibleBlocks()} fallback={<div class="p-8 text-stone-500">No document loaded</div>}>
            {(block) => <BlockView block={block} />}
          </For>
        </div>
      </div>
    </div>
  );
};
