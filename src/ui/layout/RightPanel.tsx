import { createMemo, Show } from 'solid-js';
import { store } from '@/store/document';
import { getAiClient } from '@/ai';
import { labelHex, labelI18nKey } from '@/ai/label-helpers';
import { MoodHeatmap } from '@/ui/features/MoodHeatmap';
import { PulseDashboard } from '@/ui/features/PulseDashboard';
import { WordCount } from '@/ui/features/WordCount';
import { CharacterSentiment } from '@/ui/features/CharacterSentiment';
import { toggleRightPanel } from '@/store/ui-state';
import { IconChevron } from '@/ui/shared/icons';
import { t } from '@/i18n';

export const RightPanel = () => {
  const ai = getAiClient();

  const chapterMood = createMemo(() => {
    const activeId = store.activeChapterId;
    if (!activeId) return null;
    const ids = store.blockOrder.filter(
      (id) => store.blocks[id]?.chapter_id === activeId && !store.blocks[id]?.deleted_at,
    );
    const tally: Record<string, { count: number; scoreSum: number }> = {};
    let analyzed = 0;
    for (const id of ids) {
      const s = store.sentiments[id];
      if (!s) continue;
      analyzed++;
      if (!tally[s.label]) tally[s.label] = { count: 0, scoreSum: 0 };
      tally[s.label].count++;
      tally[s.label].scoreSum += s.score;
    }
    if (analyzed === 0) return null;
    const entries = Object.entries(tally);
    entries.sort((a, b) => b[1].count - a[1].count);
    const [topLabel, topStats] = entries[0];
    return {
      label: topLabel,
      share: topStats.count / analyzed,
      analyzed,
      total: ids.length,
    };
  });

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col gap-3 overflow-auto relative">
      <button
        type="button"
        onClick={toggleRightPanel}
        class="absolute top-3 right-3 w-6 h-6 rounded text-stone-400 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center justify-center"
        title={t('topBar.hideStoryPanel')}
        aria-label={t('topBar.hideStoryPanel')}
      >
        <IconChevron size={12} class="rotate-90" />
      </button>
      <WordCount />

      <div class="flex flex-col gap-2">
        <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
          {t('rightPanel.storyPulse')}
        </div>
        <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
          <div class="text-[10px] text-stone-400 mb-2 inkmirror-smallcaps">
            {t('rightPanel.chapterMood')}
          </div>
          <Show
            when={chapterMood()}
            fallback={
              <div class="text-xs text-stone-400">
                {ai.isReady() ? t('rightPanel.noAnalysis') : t('rightPanel.modelLoading')}
              </div>
            }
          >
            {(mood) => (
              <div class="flex items-baseline justify-between">
                <span
                  class="text-lg font-semibold"
                  style={{ color: labelHex(mood().label) }}
                >
                  {t(labelI18nKey(mood().label))}
                </span>
                <span class="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                  {mood().analyzed}/{mood().total} · {Math.round(mood().share * 100)}%
                </span>
              </div>
            )}
          </Show>
        </div>
        <Show when={ai.loadError()}>
          <div class="text-[10px] text-red-500 px-1 break-all">
            {ai.loadError()}
          </div>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
          {t('rightPanel.documentMood')}
        </div>
        <MoodHeatmap />
      </div>

      <CharacterSentiment />

      <PulseDashboard />
    </div>
  );
};
