import { createMemo, For, Show } from 'solid-js';
import { store } from '@/store/document';
import { visibleBlocksInChapter, allVisibleBlocks } from '@/store/selectors';
import { SENTIMENT_COLORS } from '@/ui/blocks/sentiment-colors';
import type { UUID } from '@/types';
import { t } from '@/i18n';

interface CharacterMood {
  characterId: UUID;
  name: string;
  color: string;
  dominantLabel: string;
  avgScore: number;
  blockCount: number;
}

export const CharacterSentiment = () => {
  const moods = createMemo<CharacterMood[]>(() => {
    const activeId = store.activeChapterId;
    const blocks = activeId ? visibleBlocksInChapter(activeId) : allVisibleBlocks();
    const perChar = new Map<
      UUID,
      { labels: Record<string, number>; totalScore: number; count: number }
    >();

    for (const b of blocks) {
      if (b.metadata.type !== 'dialogue') continue;
      const speakerId = b.metadata.data.speaker_id;
      if (!speakerId) continue;
      const sentiment = store.sentiments[b.id];
      if (!sentiment) continue;

      let entry = perChar.get(speakerId);
      if (!entry) {
        entry = { labels: {}, totalScore: 0, count: 0 };
        perChar.set(speakerId, entry);
      }
      entry.labels[sentiment.label] = (entry.labels[sentiment.label] ?? 0) + 1;
      entry.totalScore += sentiment.score;
      entry.count++;
    }

    const result: CharacterMood[] = [];
    for (const [charId, entry] of perChar) {
      const character = store.characters.find((c) => c.id === charId);
      if (!character) continue;
      const dominant = Object.entries(entry.labels).sort(
        (a, b) => b[1] - a[1],
      )[0];
      result.push({
        characterId: charId,
        name: character.name,
        color: character.color,
        dominantLabel: dominant?.[0] ?? 'unknown',
        avgScore: entry.totalScore / entry.count,
        blockCount: entry.count,
      });
    }
    result.sort((a, b) => b.blockCount - a.blockCount);
    return result;
  });

  return (
    <Show when={moods().length > 0}>
      <div class="flex flex-col gap-2">
        <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
          {t('rightPanel.characterSentiment')}
        </div>
        <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
          <div class="flex flex-col gap-2">
            <For each={moods()}>
              {(m) => (
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="w-2 h-2 rounded-full shrink-0"
                      style={{ 'background-color': m.color }}
                    />
                    <span class="text-xs truncate">{m.name}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span
                      class={`text-[10px] uppercase font-medium ${
                        SENTIMENT_COLORS[m.dominantLabel] ?? 'text-stone-400'
                      }`}
                    >
                      {m.dominantLabel}
                    </span>
                    <span class="font-mono text-[10px] text-stone-400">
                      {m.blockCount}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
};
