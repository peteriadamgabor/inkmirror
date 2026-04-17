import { createMemo, Show } from 'solid-js';
import { store } from '@/store/document';
import type { Block } from '@/types';
import { t } from '@/i18n';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export const WordCount = () => {
  const stats = createMemo(() => {
    let total = 0;
    let chapterTotal = 0;
    let dialogueTotal = 0;
    let dialogueChapter = 0;
    const activeId = store.activeChapterId;
    for (const id of store.blockOrder) {
      const b: Block | undefined = store.blocks[id];
      if (!b || b.deleted_at || b.type === 'note') continue;
      const words = countWords(b.content);
      total += words;
      if (b.type === 'dialogue') dialogueTotal += words;
      if (b.chapter_id === activeId) {
        chapterTotal += words;
        if (b.type === 'dialogue') dialogueChapter += words;
      }
    }
    return {
      total,
      chapter: chapterTotal,
      dialogue: dialogueTotal,
      dialogueChapter,
      narration: total - dialogueTotal,
      narrationChapter: chapterTotal - dialogueChapter,
    };
  });

  const dialoguePct = () => {
    const s = stats();
    return s.total > 0 ? Math.round((s.dialogue / s.total) * 100) : 0;
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
        {t('wordCount.words')}
      </div>
      <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div class="text-[10px] text-stone-400 inkmirror-smallcaps">{t('docSettings.document').toLowerCase()}</div>
            <div class="font-mono text-lg leading-tight">{stats().total.toLocaleString()}</div>
          </div>
          <Show when={store.activeChapterId}>
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">{t('wordCount.chapter')}</div>
              <div class="font-mono text-lg leading-tight">
                {stats().chapter.toLocaleString()}
              </div>
            </div>
          </Show>
        </div>
        <div class="flex items-center justify-between mt-1 text-[10px] text-stone-400">
          <span>{t('wordCount.minRead', { n: Math.max(1, Math.ceil(stats().total / 250)) })}</span>
          <Show when={store.activeChapterId}>
            <span>{t('wordCount.chapterMinRead', { n: Math.max(1, Math.ceil(stats().chapter / 250)) })}</span>
          </Show>
        </div>
        <Show when={stats().dialogue > 0}>
          <div class="mt-2 pt-2 border-t border-stone-100 dark:border-stone-700/50">
            <div class="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400">
              <span>
                {t('wordCount.dialogueTotal', {
                  d: stats().dialogue.toLocaleString(),
                  n: stats().narration.toLocaleString(),
                })}
              </span>
              <span class="font-mono text-teal-600">{t('wordCount.dialoguePct', { n: dialoguePct() })}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
              <div
                class="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${dialoguePct()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
