import { For, Show, createMemo } from 'solid-js';
import { store } from '@/store/document';
import { uiState, setPlotTimelineOpen } from '@/store/ui-state';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import type { Block, Chapter, SceneMetadata } from '@/types';
import { t } from '@/i18n';

interface TimelineEntry {
  chapter: Chapter;
  block: Block;
  scene: SceneMetadata;
  orderInChapter: number;
}

export const PlotTimeline = () => {
  const entries = createMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = [];
    for (const chapter of [...store.chapters].sort((a, b) => a.order - b.order)) {
      const blocks = store.blockOrder
        .map((id) => store.blocks[id])
        .filter(
          (b): b is Block =>
            !!b && b.chapter_id === chapter.id && b.type === 'scene' && !b.deleted_at,
        )
        .sort((a, b) => a.order - b.order);
      blocks.forEach((b, i) => {
        if (b.metadata.type !== 'scene') return;
        out.push({ chapter, block: b, scene: b.metadata.data, orderInChapter: i });
      });
    }
    return out;
  });

  return (
    <Show when={uiState.plotTimelineOpen}>
      <ModalBackdrop onClick={() => setPlotTimelineOpen(false)}>
        <div
          class="w-[720px] max-h-[80vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('plotTimeline.subtitle').slice(0, 24)}…
              </div>
              <h2 class="font-serif text-lg font-normal text-stone-800 dark:text-stone-100">{t('plotTimeline.title')}</h2>
            </div>
            <button
              type="button"
              onClick={() => setPlotTimelineOpen(false)}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('aria.closeTimeline')}
            >
              ×
            </button>
          </div>
          <div class="flex-1 overflow-auto px-5 py-4">
            <Show
              when={entries().length > 0}
              fallback={
                <div class="text-sm text-stone-500 italic text-center py-8">
                  {t('plotTimeline.empty')}
                </div>
              }
            >
              <div class="flex flex-col">
                <For each={entries()}>
                  {(entry, i) => {
                    const isNewChapter = () =>
                      i() === 0 || entries()[i() - 1].chapter.id !== entry.chapter.id;
                    const cast = () =>
                      entry.scene.character_ids
                        .map((id) => store.characters.find((c) => c.id === id))
                        .filter((c): c is NonNullable<typeof c> => !!c);
                    return (
                      <>
                        <Show when={isNewChapter()}>
                          <div class="text-[10px] inkmirror-smallcaps text-violet-500 mt-4 mb-2 first:mt-0">
                            {entry.chapter.title}
                          </div>
                        </Show>
                        <div class="flex gap-3 pl-2 pb-3 relative">
                          <div class="flex flex-col items-center">
                            <div class="w-2 h-2 rounded-full bg-orange-600 mt-1.5 shrink-0" />
                            <div class="w-px flex-1 bg-stone-200 dark:bg-stone-700 mt-1" />
                          </div>
                          <div class="flex-1 pb-1">
                            <div class="flex items-baseline gap-2 flex-wrap">
                              <span class="font-serif text-sm text-stone-800 dark:text-stone-100">
                                {entry.scene.location || '(no location)'}
                              </span>
                              <Show when={entry.scene.time}>
                                <span class="text-[11px] text-stone-400">· {entry.scene.time}</span>
                              </Show>
                              <Show when={entry.scene.mood}>
                                <span class="text-[11px] italic text-orange-500">
                                  {entry.scene.mood}
                                </span>
                              </Show>
                            </div>
                            <Show when={entry.block.content.trim()}>
                              <div class="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 mt-0.5 font-serif">
                                {entry.block.content}
                              </div>
                            </Show>
                            <Show when={cast().length > 0}>
                              <div class="flex flex-wrap gap-1 mt-1">
                                <For each={cast()}>
                                  {(c) => (
                                    <span
                                      class="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 flex items-center gap-1"
                                    >
                                      <span
                                        class="w-1.5 h-1.5 rounded-full"
                                        style={{ 'background-color': c.color }}
                                      />
                                      {c.name}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </div>
                      </>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};
