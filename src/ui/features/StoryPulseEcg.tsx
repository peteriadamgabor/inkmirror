import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { store } from '@/store/document';
import type { UUID } from '@/types';

const STRIP_HEIGHT = 60;
const BAR_WIDTH = 6;
const BAR_GAP = 3;
const BASELINE_PAD = 10; // inner vertical padding so peaks don't touch edges

interface BarData {
  blockId: UUID;
  polarity: number; // -1..1 (negative..positive), 0 for neutral/unknown
  color: string;
  tooltip: string;
  analyzed: boolean;
}

function polarityFromSentiment(label: string, score: number): number {
  if (label === 'positive') return score;
  if (label === 'negative') return -score;
  return 0;
}

function colorFromLabel(label: string | null): string {
  if (label === 'positive') return '#10b981'; // emerald-500
  if (label === 'negative') return '#ef4444'; // red-500
  if (label === 'neutral') return '#a8a29e'; // stone-400
  return '#57534e'; // stone-600 — un-analyzed
}

export const StoryPulseEcg = () => {
  // Trigger the left-to-right draw animation each time the user
  // switches chapters. The `drawing` flag flips true for ~600ms,
  // and the matching CSS on `.inkmirror-ecg-drawing` animates the
  // SVG's mask-size from 0% → 100%.
  const [drawing, setDrawing] = createSignal(false);
  createEffect(
    on(
      () => store.activeChapterId,
      () => {
        setDrawing(true);
        const t = setTimeout(() => setDrawing(false), 650);
        return () => clearTimeout(t);
      },
    ),
  );

  const bars = createMemo<BarData[]>(() => {
    const activeId = store.activeChapterId;
    if (!activeId) return [];
    const ids = store.blockOrder.filter(
      (id) => store.blocks[id]?.chapter_id === activeId && !store.blocks[id]?.deleted_at,
    );
    return ids.map((id) => {
      const sentiment = store.sentiments[id];
      if (!sentiment) {
        return {
          blockId: id,
          polarity: 0,
          color: colorFromLabel(null),
          tooltip: 'not yet analyzed',
          analyzed: false,
        };
      }
      return {
        blockId: id,
        polarity: polarityFromSentiment(sentiment.label, sentiment.score),
        color: colorFromLabel(sentiment.label),
        tooltip: `${sentiment.label} · ${Math.round(sentiment.score * 100)}%`,
        analyzed: true,
      };
    });
  });

  const totalWidth = createMemo(() => {
    const n = bars().length;
    if (n === 0) return 0;
    return n * BAR_WIDTH + (n - 1) * BAR_GAP;
  });

  const baseline = STRIP_HEIGHT / 2;
  const amplitude = baseline - BASELINE_PAD;

  const scrollToBlock = (blockId: UUID) => {
    const scroller = document.querySelector<HTMLElement>('[data-scroll-root="editor"]');
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <Show
      when={bars().length > 0}
      fallback={
        <div
          class="inkmirror-ecg px-4 py-2 text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-200 dark:border-stone-700"
          style={{ height: `${STRIP_HEIGHT}px` }}
        >
          story pulse
        </div>
      }
    >
      <div
        class="inkmirror-ecg flex items-center gap-3 px-4 border-b border-stone-200 dark:border-stone-700 overflow-x-auto"
        classList={{ 'inkmirror-ecg-drawing': drawing() }}
        style={{ height: `${STRIP_HEIGHT}px` }}
      >
        <div class="text-[9px] uppercase tracking-wider text-stone-400 shrink-0 select-none">
          pulse
        </div>
        <svg
          width={totalWidth()}
          height={STRIP_HEIGHT - 8}
          viewBox={`0 0 ${totalWidth()} ${STRIP_HEIGHT - 8}`}
          class="shrink-0"
          role="img"
          aria-label="Story pulse — sentiment across blocks"
        >
          {/* baseline */}
          <line
            x1={0}
            y1={baseline - 4}
            x2={totalWidth()}
            y2={baseline - 4}
            stroke="currentColor"
            stroke-opacity="0.15"
            stroke-width="1"
            class="text-stone-500"
          />
          <For each={bars()}>
            {(bar, idx) => {
              const x = idx() * (BAR_WIDTH + BAR_GAP);
              const h = Math.abs(bar.polarity) * amplitude;
              // neutral / un-analyzed: tiny centered dot
              if (!bar.analyzed || bar.polarity === 0) {
                return (
                  <circle
                    cx={x + BAR_WIDTH / 2}
                    cy={baseline - 4}
                    r={2}
                    fill={bar.color}
                    fill-opacity={bar.analyzed ? 0.6 : 0.3}
                    class="cursor-pointer"
                    onClick={() => scrollToBlock(bar.blockId)}
                  >
                    <title>{bar.tooltip}</title>
                  </circle>
                );
              }
              const y = bar.polarity > 0 ? baseline - 4 - h : baseline - 4;
              return (
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={Math.max(2, h)}
                  rx={1.5}
                  fill={bar.color}
                  class="cursor-pointer"
                  onClick={() => scrollToBlock(bar.blockId)}
                >
                  <title>{bar.tooltip}</title>
                </rect>
              );
            }}
          </For>
        </svg>
      </div>
    </Show>
  );
};
