import { createMemo, createSignal, For, Show } from 'solid-js';
import { store } from '@/store/document';
import { visibleBlocksInChapter } from '@/store/selectors';
import { chapterKindOf } from '@/exporters';
import { firstSentence, lastSentence } from '@/utils/sentence';
import { IconChevron } from '@/ui/shared/icons';
import { t } from '@/i18n';

interface ChapterEdges {
  id: string;
  title: string;
  first: string;
  last: string;
}

/**
 * Last Words / First Lines — every standard chapter's opening sentence in
 * one column, its closing sentence in the other. A pure craft mirror: read
 * the openings down one side, the endings down the other, and judge them as
 * a set. No AI, no suggestion — the writer's own first and last lines handed
 * back. Non-standard chapter kinds (cover, dedication, epigraph, …) are
 * skipped; their text isn't story prose. Collapsed by default to stay quiet.
 */
export const LastWordsFirstLines = () => {
  const [open, setOpen] = createSignal(false);

  const rows = createMemo<ChapterEdges[]>(() => {
    const out: ChapterEdges[] = [];
    for (const chapter of store.chapters) {
      if (chapterKindOf(chapter) !== 'standard') continue;
      const prose = visibleBlocksInChapter(chapter.id).filter((b) => b.type !== 'note');
      if (prose.length === 0) continue;
      const first = firstSentence(prose[0].content);
      const last = lastSentence(prose[prose.length - 1].content);
      if (!first && !last) continue;
      out.push({ id: chapter.id, title: chapter.title, first, last });
    }
    return out;
  });

  return (
    <Show when={rows().length > 0}>
      <div class="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          class="flex items-center justify-between text-[10px] font-medium text-stone-400 inkmirror-smallcaps hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          aria-expanded={open()}
          title={t('lastWords.subtitle')}
        >
          <span class="flex items-center gap-1.5">
            <IconChevron size={10} class={open() ? 'rotate-180' : ''} />
            {t('lastWords.title')}
          </span>
          <span class="font-mono tabular-nums text-stone-400">{rows().length}</span>
        </button>
        <Show when={open()}>
          <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700">
            <div class="grid grid-cols-2 gap-x-3 pb-2 mb-1 border-b border-stone-100 dark:border-stone-700/50 text-[10px] text-stone-400 inkmirror-smallcaps">
              <span>{t('lastWords.firstLines')}</span>
              <span>{t('lastWords.lastWords')}</span>
            </div>
            <div class="flex flex-col divide-y divide-stone-100 dark:divide-stone-700/50">
              <For each={rows()}>
                {(row) => (
                  <div class="py-2">
                    <div
                      class="text-[10px] text-stone-400 inkmirror-smallcaps mb-1 truncate"
                      title={row.title}
                    >
                      {row.title}
                    </div>
                    <div class="grid grid-cols-2 gap-x-3 items-start">
                      <p class="text-xs leading-snug text-stone-700 dark:text-stone-300 font-serif">
                        {row.first || '—'}
                      </p>
                      <p class="text-xs leading-snug text-stone-700 dark:text-stone-300 font-serif">
                        {row.last || '—'}
                      </p>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
};
