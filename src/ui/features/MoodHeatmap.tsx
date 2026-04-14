import { createMemo, For, Show } from 'solid-js';
import { store, setActiveChapter } from '@/store/document';
import type { UUID } from '@/types';

const SENTIMENT_HEX: Record<string, string> = {
  positive: '#10b981',
  neutral: '#a8a29e',
  negative: '#ef4444',
};

interface ChapterStat {
  id: UUID;
  title: string;
  blockCount: number;
  analyzed: number;
  dominantLabel: string | null;
  dominantShare: number;
  color: string;
}

function computeChapterStats(): ChapterStat[] {
  return store.chapters.map((chapter) => {
    const blockIds = store.blockOrder.filter(
      (id) => store.blocks[id]?.chapter_id === chapter.id && !store.blocks[id]?.deleted_at,
    );
    const tally: Record<string, number> = {};
    let analyzed = 0;
    for (const id of blockIds) {
      const s = store.sentiments[id];
      if (!s) continue;
      analyzed++;
      tally[s.label] = (tally[s.label] ?? 0) + 1;
    }
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const [dominantLabel, dominantCount] = entries[0] ?? [null, 0];
    return {
      id: chapter.id,
      title: chapter.title,
      blockCount: blockIds.length,
      analyzed,
      dominantLabel,
      dominantShare: analyzed > 0 ? dominantCount / analyzed : 0,
      color: dominantLabel ? SENTIMENT_HEX[dominantLabel] ?? '#57534e' : '#57534e',
    };
  });
}

export const MoodHeatmap = () => {
  const stats = createMemo(computeChapterStats);
  const totalBlocks = createMemo(() =>
    stats().reduce((sum, s) => sum + Math.max(s.blockCount, 1), 0),
  );

  return (
    <Show
      when={stats().length > 0}
      fallback={<div class="text-xs text-stone-400">no chapters</div>}
    >
      <div class="flex flex-col gap-1">
        <div class="flex h-8 w-full rounded overflow-hidden border border-stone-200 dark:border-stone-700">
          <For each={stats()}>
            {(s) => {
              const widthPct = (Math.max(s.blockCount, 1) / totalBlocks()) * 100;
              const isActive = () => store.activeChapterId === s.id;
              return (
                <button
                  type="button"
                  onClick={() => setActiveChapter(s.id)}
                  title={`${s.title} — ${s.dominantLabel ?? 'no analysis'} (${s.analyzed}/${s.blockCount})`}
                  style={{
                    width: `${widthPct}%`,
                    'background-color': s.color,
                    opacity: s.analyzed > 0 ? 0.85 : 0.3,
                  }}
                  class="relative border-r border-stone-200/40 dark:border-stone-900/40 last:border-r-0 hover:opacity-100 transition-opacity cursor-pointer"
                  classList={{
                    'ring-2 ring-inset ring-violet-500': isActive(),
                  }}
                />
              );
            }}
          </For>
        </div>
        <div class="text-[9px] text-stone-400 flex justify-between">
          <span>{stats().length} chapters</span>
          <span>
            {stats().reduce((n, s) => n + s.analyzed, 0)}/
            {stats().reduce((n, s) => n + s.blockCount, 0)} analyzed
          </span>
        </div>
      </div>
    </Show>
  );
};
