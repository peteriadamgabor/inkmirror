import { createMemo, For, Show } from 'solid-js';
import { store } from '@/store/document';
import { dialogueBlocksForSpeaker } from '@/store/selectors';
import { labelPolarity } from '@/engine/labels';
import { t } from '@/i18n';
import type { UUID } from '@/types';

/**
 * Per-character sentiment over chapters. For each tracked character,
 * we average the polarity of their dialogue blocks within each chapter
 * and plot one line connecting the resulting data points.
 *
 * Dialogue-only (not all mentions) — this is about how the character
 * *sounds* across the arc, not how others describe them. Adding a
 * mentions-in-narration signal is a follow-up if it proves useful.
 */

interface ChapterPoint {
  chapterIdx: number;
  chapterId: UUID;
  polarity: number;
  count: number;
}

interface CharacterArc {
  characterId: UUID;
  name: string;
  color: string;
  points: ChapterPoint[];
}

const WIDTH = 280;
const HEIGHT = 100;
const PAD_X = 14;
const PAD_Y = 12;

function computeArcs(): CharacterArc[] {
  const chapters = store.chapters;
  if (chapters.length < 2) return [];
  const out: CharacterArc[] = [];

  for (const ch of store.characters) {
    const speakerBlocks = dialogueBlocksForSpeaker(ch.id);
    if (speakerBlocks.length === 0) continue;
    // Bucket the speaker's dialogues by chapter id → polarity sum + count.
    const byChapter = new Map<UUID, { sum: number; count: number }>();
    for (const b of speakerBlocks) {
      const sentiment = store.sentiments[b.id];
      if (!sentiment) continue;
      const bucket = byChapter.get(b.chapter_id) ?? { sum: 0, count: 0 };
      bucket.sum += labelPolarity(sentiment.label, sentiment.score);
      bucket.count += 1;
      byChapter.set(b.chapter_id, bucket);
    }
    const points: ChapterPoint[] = [];
    chapters.forEach((chap, chapterIdx) => {
      const bucket = byChapter.get(chap.id);
      if (!bucket || bucket.count === 0) return;
      points.push({
        chapterIdx,
        chapterId: chap.id,
        polarity: bucket.sum / bucket.count,
        count: bucket.count,
      });
    });
    if (points.length > 0) {
      out.push({
        characterId: ch.id,
        name: ch.name,
        color: ch.color,
        points,
      });
    }
  }
  return out;
}

export const CharacterArcs = () => {
  const arcs = createMemo(computeArcs);
  const chapterCount = createMemo(() => store.chapters.length);

  // Chapter centers along the X axis, evenly spaced.
  const chapterX = (chapterIdx: number) => {
    const n = Math.max(1, chapterCount());
    if (n === 1) return WIDTH / 2;
    const usable = WIDTH - PAD_X * 2;
    return PAD_X + (chapterIdx / (n - 1)) * usable;
  };

  // Polarity in [-1, 1] → y coord, with 0 at the vertical midpoint.
  const polarityY = (p: number) => {
    const mid = HEIGHT / 2;
    const usable = HEIGHT / 2 - PAD_Y;
    // Flip sign so positive polarity sits above the midline.
    return mid - p * usable;
  };

  const hasEnoughData = () =>
    arcs().filter((a) => a.points.length > 0).length >= 1 && chapterCount() >= 2;

  const scrollToChapter = (chapterId: UUID) => {
    const anchor = document.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
        {t('characterArcs.title')}
      </div>
      <Show
        when={hasEnoughData()}
        fallback={
          <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400 italic">
            {t('characterArcs.empty')}
          </div>
        }
      >
        <div class="px-3 py-3 rounded-lg border border-stone-200 dark:border-stone-700">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            class="block w-full h-auto"
            role="img"
            aria-label={t('characterArcs.title')}
          >
            {/* Horizontal midline = neutral */}
            <line
              x1={PAD_X}
              y1={HEIGHT / 2}
              x2={WIDTH - PAD_X}
              y2={HEIGHT / 2}
              stroke="currentColor"
              stroke-opacity="0.12"
              class="text-stone-500"
            />
            {/* Subtle chapter tick marks */}
            <For each={store.chapters}>
              {(_, idx) => (
                <line
                  x1={chapterX(idx())}
                  y1={PAD_Y}
                  x2={chapterX(idx())}
                  y2={HEIGHT - PAD_Y}
                  stroke="currentColor"
                  stroke-opacity="0.05"
                  stroke-dasharray="2 3"
                  class="text-stone-500"
                />
              )}
            </For>
            <For each={arcs()}>
              {(arc) => (
                <g>
                  <Show when={arc.points.length > 1}>
                    <polyline
                      fill="none"
                      stroke={arc.color}
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      points={arc.points
                        .map((p) => `${chapterX(p.chapterIdx)},${polarityY(p.polarity)}`)
                        .join(' ')}
                    />
                  </Show>
                  <For each={arc.points}>
                    {(p) => (
                      <circle
                        cx={chapterX(p.chapterIdx)}
                        cy={polarityY(p.polarity)}
                        r={2.5}
                        fill={arc.color}
                        class="cursor-pointer"
                        onClick={() => scrollToChapter(p.chapterId)}
                      >
                        <title>
                          {t('characterArcs.tooltip', {
                            name: arc.name,
                            chapter: String(p.chapterIdx + 1),
                            n: String(p.count),
                          })}
                        </title>
                      </circle>
                    )}
                  </For>
                </g>
              )}
            </For>
          </svg>
          {/* Legend: character names colored by their line */}
          <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <For each={arcs()}>
              {(arc) => (
                <div class="flex items-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    style={{ 'background-color': arc.color }}
                  />
                  <span>{arc.name}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};
