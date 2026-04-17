import { createMemo, For, Show } from 'solid-js';
import { store, setActiveChapter } from '@/store/document';
import type { UUID } from '@/types';
import { labelHex, labelI18nKey } from '@/ai/label-helpers';
import { t } from '@/i18n';

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
    // Weight each label by the block's word count so long prose beats
    // short dialogue when computing the chapter's dominant mood.
    const tally: Record<string, number> = {};
    let analyzed = 0;
    for (const id of blockIds) {
      const s = store.sentiments[id];
      if (!s) continue;
      analyzed++;
      const wc = Math.max(1, (store.blocks[id]?.content ?? '').trim().split(/\s+/).length);
      tally[s.label] = (tally[s.label] ?? 0) + wc;
    }
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const [dominantLabel, dominantWeight] = entries[0] ?? [null, 0];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    return {
      id: chapter.id,
      title: chapter.title,
      blockCount: blockIds.length,
      analyzed,
      dominantLabel,
      dominantShare: totalWeight > 0 ? dominantWeight / totalWeight : 0,
      color: labelHex(dominantLabel),
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
                  title={`${s.title} — ${s.dominantLabel ? t(labelI18nKey(s.dominantLabel)) : t('mood.unanalyzed')} (${s.analyzed}/${s.blockCount})`}
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
