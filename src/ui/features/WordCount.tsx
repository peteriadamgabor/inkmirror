import { createMemo, Show } from 'solid-js';
import { store } from '@/store/document';
import { allVisibleBlocks } from '@/store/selectors';
import { t } from '@/i18n';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// Per-document session baseline: the document's total word count the
// first time we observe it during this page load. Reset on reload —
// the writer wants "what did I write today, in this sitting" rather
// than "lifetime total." Keyed by document id so switching documents
// captures a fresh baseline for the new doc.
const sessionBaselines = new Map<string, number>();

export const WordCount = () => {
  const stats = createMemo(() => {
    let total = 0;
    let chapterTotal = 0;
    let dialogueTotal = 0;
    let dialogueChapter = 0;
    const activeId = store.activeChapterId;
    for (const b of allVisibleBlocks()) {
      if (b.type === 'note') continue;
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

  // Words added during this session — non-negative delta from the
  // first observation of this doc's total. Hides when zero or no doc.
  const sessionDelta = createMemo(() => {
    const docId = store.document?.id;
    if (!docId) return 0;
    const total = stats().total;
    if (!sessionBaselines.has(docId)) {
      sessionBaselines.set(docId, total);
      return 0;
    }
    return Math.max(0, total - (sessionBaselines.get(docId) ?? total));
  });

  return (
    <div class="flex flex-col gap-2">
      <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
        {t('wordCount.words')}
      </div>
      <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div class="text-[10px] text-stone-400 inkmirror-smallcaps">{t('docSettings.document').toLowerCase()}</div>
            <div class="flex items-baseline gap-1.5">
              <span class="font-mono text-lg leading-tight">{stats().total.toLocaleString()}</span>
              <Show when={sessionDelta() > 0}>
                <span
                  class="font-mono text-[10px] text-violet-500 tabular-nums"
                  title={t('wordCount.sessionTitle')}
                >
                  +{sessionDelta().toLocaleString()}
                </span>
              </Show>
            </div>
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
