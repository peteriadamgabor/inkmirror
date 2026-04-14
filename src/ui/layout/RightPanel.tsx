import { createMemo, Show } from 'solid-js';
import { useTheme } from '@/ui/theme';
import { store } from '@/store/document';
import { getAiClient } from '@/ai';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-500',
  neutral: 'text-stone-400',
  negative: 'text-red-500',
};

export const RightPanel = () => {
  const { theme, toggleTheme } = useTheme();
  const ai = getAiClient();

  const firstBlockId = createMemo(() => {
    const activeId = store.activeChapterId;
    if (!activeId) return null;
    return (
      store.blockOrder.find(
        (id) => store.blocks[id]?.chapter_id === activeId && !store.blocks[id]?.deleted_at,
      ) ?? null
    );
  });

  const firstBlockSentiment = createMemo(() => {
    const id = firstBlockId();
    if (!id) return null;
    return store.sentiments[id] ?? null;
  });

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
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col gap-4 overflow-auto">
      <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
        Settings
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
        aria-label="Toggle theme"
      >
        <span>Theme</span>
        <span class="font-mono text-xs text-stone-500 dark:text-stone-400">
          {theme() === 'dark' ? '🌙 dark' : '☀ light'}
        </span>
      </button>

      <div class="flex flex-col gap-2 mt-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Story pulse
        </div>

        <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
          <div class="text-[10px] uppercase tracking-wider text-stone-400 mb-2">
            First block
          </div>
          <Show
            when={firstBlockSentiment()}
            fallback={
              <div class="text-xs text-stone-400">
                {ai.isReady() ? 'no analysis yet' : 'model loading…'}
              </div>
            }
          >
            {(s) => (
              <div class="flex items-baseline justify-between">
                <span class={`text-lg font-semibold capitalize ${SENTIMENT_COLORS[s().label] ?? 'text-stone-500'}`}>
                  {s().label}
                </span>
                <span class="font-mono text-[10px] text-stone-500 dark:text-stone-400">
                  {Math.round(s().score * 100)}%
                </span>
              </div>
            )}
          </Show>
        </div>

        <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
          <div class="text-[10px] uppercase tracking-wider text-stone-400 mb-2">
            Chapter mood
          </div>
          <Show
            when={chapterMood()}
            fallback={
              <div class="text-xs text-stone-400">
                {ai.isReady() ? 'no analysis yet' : 'model loading…'}
              </div>
            }
          >
            {(mood) => (
              <div class="flex items-baseline justify-between">
                <span class={`text-lg font-semibold capitalize ${SENTIMENT_COLORS[mood().label] ?? 'text-stone-500'}`}>
                  {mood().label}
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
    </div>
  );
};
