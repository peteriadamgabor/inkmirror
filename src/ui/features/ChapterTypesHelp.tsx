import { For, Show } from 'solid-js';
import { uiState, setChapterTypesHelpOpen } from '@/store/ui-state';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { t } from '@/i18n';

interface KindDoc {
  keyPrefix: 'standard' | 'cover' | 'dedication' | 'epigraph' | 'acknowledgments' | 'afterword';
  /** Just the text color. Border is the shared neutral so the cards
   *  stop reading as a six-color palette in chrome. The glyph + name
   *  keep their hue so the taxonomy is still visually distinct. */
  glyphColor: string;
  glyph: string;
  useForCount: number;
  noteCount: number;
}

const DOCS: KindDoc[] = [
  { keyPrefix: 'standard',        glyphColor: 'text-violet-500',  glyph: '§', useForCount: 3, noteCount: 3 },
  { keyPrefix: 'cover',           glyphColor: 'text-orange-600',  glyph: '◆', useForCount: 3, noteCount: 4 },
  { keyPrefix: 'dedication',      glyphColor: 'text-rose-500',    glyph: '♡', useForCount: 3, noteCount: 4 },
  { keyPrefix: 'epigraph',        glyphColor: 'text-teal-600',    glyph: '“', useForCount: 3, noteCount: 4 },
  { keyPrefix: 'acknowledgments', glyphColor: 'text-emerald-500', glyph: '✦', useForCount: 3, noteCount: 3 },
  { keyPrefix: 'afterword',       glyphColor: 'text-sky-500',     glyph: '·', useForCount: 3, noteCount: 3 },
];

// Sentinel tokens we inject into the translated intro so we can split
// it back into text spans and <code> pills without losing the
// translator-controlled surrounding text.
const PLUS_TOKEN = '\u0001PLUS\u0001';
const MENU_TOKEN = '\u0001MENU\u0001';

const renderIntro = () => {
  const raw = t('chapterTypesHelp.intro', { plus: PLUS_TOKEN, menu: MENU_TOKEN });
  const parts: Array<{ kind: 'text' | 'plus' | 'menu'; value: string }> = [];
  let remaining = raw;
  while (remaining.length > 0) {
    const plusIdx = remaining.indexOf(PLUS_TOKEN);
    const menuIdx = remaining.indexOf(MENU_TOKEN);
    let nextIdx = -1;
    let nextKind: 'plus' | 'menu' = 'plus';
    if (plusIdx !== -1 && (menuIdx === -1 || plusIdx < menuIdx)) {
      nextIdx = plusIdx;
      nextKind = 'plus';
    } else if (menuIdx !== -1) {
      nextIdx = menuIdx;
      nextKind = 'menu';
    }
    if (nextIdx === -1) {
      parts.push({ kind: 'text', value: remaining });
      break;
    }
    if (nextIdx > 0) {
      parts.push({ kind: 'text', value: remaining.slice(0, nextIdx) });
    }
    parts.push({ kind: nextKind, value: '' });
    remaining = remaining.slice(nextIdx + (nextKind === 'plus' ? PLUS_TOKEN.length : MENU_TOKEN.length));
  }
  return parts;
};

export const ChapterTypesHelp = () => (
  <Show when={uiState.chapterTypesHelpOpen}>
    <ModalBackdrop onClick={() => setChapterTypesHelpOpen(false)}>
      <div
        class="w-[640px] max-w-[92vw] max-h-[85vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
          <div>
            <div class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
              {t('chapterTypesHelp.header')}
            </div>
            <h2 class="font-serif text-lg font-normal text-stone-800 dark:text-stone-100">
              {t('chapterTypesHelp.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setChapterTypesHelpOpen(false)}
            class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            aria-label={t('chapterTypesHelp.closeLabel')}
          >
            ×
          </button>
        </div>

        <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
          <div class="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            <For each={renderIntro()}>
              {(part) => {
                if (part.kind === 'text') return <>{part.value}</>;
                if (part.kind === 'plus')
                  return (
                    <code class="font-mono text-[11px] px-1 rounded bg-stone-100 dark:bg-stone-700">
                      +
                    </code>
                  );
                return (
                  <code class="font-mono text-[11px] px-1 rounded bg-stone-100 dark:bg-stone-700">
                    ⋯
                  </code>
                );
              }}
            </For>
          </div>

          <For each={DOCS}>
            {(doc) => (
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <div class="flex items-baseline gap-3 mb-2">
                  <span class={`font-serif text-2xl ${doc.glyphColor}`}>{doc.glyph}</span>
                  <div>
                    <div class={`text-[10px] tracking-wider font-medium inkmirror-smallcaps ${doc.glyphColor}`}>
                      {t(`chapterTypesHelp.${doc.keyPrefix}.name`)}
                    </div>
                    <div class="font-serif text-base text-stone-800 dark:text-stone-100">
                      {t(`chapterTypesHelp.${doc.keyPrefix}.tagline`)}
                    </div>
                  </div>
                </div>
                <div class="mt-3">
                  <div class="text-[10px] tracking-wider text-stone-400 mb-1 inkmirror-smallcaps">
                    {t('chapterTypesHelp.useForLabel')}
                  </div>
                  <ul class="text-xs text-stone-700 dark:text-stone-300 list-disc pl-5 space-y-0.5">
                    <For
                      each={Array.from({ length: doc.useForCount }, (_, i) =>
                        t(`chapterTypesHelp.${doc.keyPrefix}.useFor${i + 1}`),
                      )}
                    >
                      {(s) => <li>{s}</li>}
                    </For>
                  </ul>
                </div>
                <div class="mt-3">
                  <div class="text-[10px] tracking-wider text-stone-400 mb-1 inkmirror-smallcaps">
                    {t('chapterTypesHelp.howItBehavesLabel')}
                  </div>
                  <ul class="text-xs text-stone-600 dark:text-stone-400 list-disc pl-5 space-y-0.5">
                    <For
                      each={Array.from({ length: doc.noteCount }, (_, i) =>
                        t(`chapterTypesHelp.${doc.keyPrefix}.note${i + 1}`),
                      )}
                    >
                      {(s) => <li>{s}</li>}
                    </For>
                  </ul>
                </div>
              </div>
            )}
          </For>

          <div class="text-[11px] text-stone-400 italic text-center pt-1">
            {t('chapterTypesHelp.tip')}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  </Show>
);
