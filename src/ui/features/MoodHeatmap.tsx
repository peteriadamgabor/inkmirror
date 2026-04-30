import { createMemo, For, Show } from 'solid-js';
import { store, setActiveChapter } from '@/store/document';
import { dominantChapterLabel, visibleBlocksInChapter } from '@/store/selectors';
import type { UUID } from '@/types';
import { labelHex, labelI18nKey } from '@/engine/labels';
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
    const blocks = visibleBlocksInChapter(chapter.id);
    // Weight by word count so long prose outweighs short dialogue.
    const dominant = dominantChapterLabel(chapter.id, { weighted: true });
    return {
      id: chapter.id,
      title: chapter.title,
      blockCount: blocks.length,
      analyzed: dominant?.analyzed ?? 0,
      dominantLabel: dominant?.label ?? null,
      dominantShare: dominant?.share ?? 0,
      color: labelHex(dominant?.label ?? null),
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
      fallback={<div class="text-xs text-stone-400">{t('moodHeatmap.noChapters')}</div>}
    >
      <div class="flex flex-col gap-1">
        <div class="flex h-8 w-full rounded overflow-hidden border border-stone-200 dark:border-stone-700">
          <For each={stats()}>
            {(s) => {
              const widthPct = (Math.max(s.blockCount, 1) / totalBlocks()) * 100;
              const isActive = () => store.activeChapterId === s.id;
              const tooltip = () =>
                t('moodHeatmap.tooltip', {
                  title: s.title,
                  label: s.dominantLabel ? t(labelI18nKey(s.dominantLabel)) : t('mood.unanalyzed'),
                  analyzed: String(s.analyzed),
                  total: String(s.blockCount),
                });
              return (
                <button
                  type="button"
                  onClick={() => setActiveChapter(s.id)}
                  title={tooltip()}
                  aria-label={tooltip()}
                  aria-current={isActive() ? 'true' : undefined}
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
          <span>{t('moodHeatmap.chapterCount', { n: String(stats().length) })}</span>
          <span>
            {t('moodHeatmap.analyzedRatio', {
              analyzed: String(stats().reduce((n, s) => n + s.analyzed, 0)),
              total: String(stats().reduce((n, s) => n + s.blockCount, 0)),
            })}
          </span>
        </div>
      </div>
    </Show>
  );
};
