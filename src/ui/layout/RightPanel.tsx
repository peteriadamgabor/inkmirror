import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { useTheme } from '@/ui/theme';
import { store } from '@/store/document';
import { getAiClient } from '@/ai';
import { SENTIMENT_COLORS } from '@/ui/blocks/sentiment-colors';
import { MoodHeatmap } from '@/ui/features/MoodHeatmap';
import { PulseDashboard } from '@/ui/features/PulseDashboard';
import { getSonificationEngine, type MoodLabel } from '@/audio/engine';

export const RightPanel = () => {
  const { theme, toggleTheme } = useTheme();
  const ai = getAiClient();
  const sono = getSonificationEngine();
  const [sonoOn, setSonoOn] = createSignal(false);

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

  // Reactively drive the sonification engine from chapterMood.
  createEffect(() => {
    if (!sonoOn()) return;
    const mood = chapterMood();
    if (!mood) return;
    const label = mood.label as MoodLabel;
    if (label === 'positive' || label === 'neutral' || label === 'negative') {
      sono.setMood(label);
    }
  });

  const toggleSono = async () => {
    if (sonoOn()) {
      sono.stop();
      setSonoOn(false);
    } else {
      const mood = chapterMood();
      const initial: MoodLabel =
        mood && (mood.label === 'positive' || mood.label === 'negative')
          ? (mood.label as MoodLabel)
          : 'neutral';
      try {
        await sono.start(initial);
        setSonoOn(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('sonification start failed:', err);
      }
    }
  };

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

      <div class="flex flex-col gap-2 mt-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Document mood
        </div>
        <MoodHeatmap />
      </div>

      <div class="mt-2">
        <PulseDashboard />
      </div>

      <div class="flex flex-col gap-2 mt-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Sonification
        </div>
        <button
          type="button"
          onClick={toggleSono}
          class="flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
        >
          <span>{sonoOn() ? 'Stop ambient tone' : 'Play ambient tone'}</span>
          <span class="font-mono text-[10px] text-stone-500 dark:text-stone-400">
            {sonoOn() ? '■' : '▶'}
          </span>
        </button>
        <Show when={sonoOn()}>
          <div class="text-[10px] text-stone-400 px-1">
            tracking chapter mood · click stop to silence
          </div>
        </Show>
      </div>
    </div>
  );
};
