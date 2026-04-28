import { createMemo, createSignal, For, Show } from 'solid-js';
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

type CountedBlockType = 'text' | 'dialogue' | 'scene';
const ALL_TYPES: readonly CountedBlockType[] = ['text', 'dialogue', 'scene'] as const;
const FILTER_LABEL_KEY: Record<CountedBlockType, 'wordCount.filterText' | 'wordCount.filterDialogue' | 'wordCount.filterScene'> = {
  text: 'wordCount.filterText',
  dialogue: 'wordCount.filterDialogue',
  scene: 'wordCount.filterScene',
};

export const WordCount = () => {
  // Block-type filter — ephemeral per-session toggle. Default is all
  // three on so the displayed totals match the historical behavior
  // unless the writer opts in to a narrower view.
  const [activeTypes, setActiveTypes] = createSignal<readonly CountedBlockType[]>(ALL_TYPES);
  const isActive = (type: CountedBlockType) => activeTypes().includes(type);
  const isFiltered = () => activeTypes().length !== ALL_TYPES.length;
  const toggleType = (type: CountedBlockType) => {
    const current = activeTypes();
    const has = current.includes(type);
    // Don't let the user disable every chip — silently no-op so the
    // panel never collapses to a stack of zeroes.
    if (has && current.length === 1) return;
    setActiveTypes(
      has
        ? current.filter((other) => other !== type)
        : ALL_TYPES.filter((other) => current.includes(other) || other === type),
    );
  };

  const stats = createMemo(() => {
    let total = 0;
    let chapterTotal = 0;
    let dialogueTotal = 0;
    let dialogueChapter = 0;
    const activeId = store.activeChapterId;
    const types = activeTypes();
    for (const b of allVisibleBlocks()) {
      if (b.type === 'note') continue;
      if (b.type !== 'text' && b.type !== 'dialogue' && b.type !== 'scene') continue;
      if (!types.includes(b.type)) continue;
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
  // first observation of this doc's total. Hides when zero, no doc,
  // or when the filter is active (the baseline was captured against
  // the unfiltered total, so a filtered delta would be misleading).
  const sessionDelta = createMemo(() => {
    const docId = store.document?.id;
    if (!docId) return 0;
    if (isFiltered()) return 0;
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
        <div
          class="flex flex-wrap gap-1 mb-2"
          role="group"
          aria-label={t('wordCount.filterTitle')}
          title={t('wordCount.filterTitle')}
        >
          <For each={ALL_TYPES}>
            {(type) => (
              <button
                type="button"
                onClick={() => toggleType(type)}
                aria-pressed={isActive(type)}
                class="px-1.5 py-0.5 text-[10px] rounded border transition-colors inkmirror-smallcaps"
                classList={{
                  'border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300':
                    isActive(type),
                  'border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300':
                    !isActive(type),
                }}
              >
                {t(FILTER_LABEL_KEY[type])}
              </button>
            )}
          </For>
        </div>
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
        <Show when={!isFiltered() && stats().dialogue > 0}>
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
