import { For, Show } from 'solid-js';
import { uiState, setBlockTypesHelpOpen } from '@/store/ui-state';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { t } from '@/i18n';

interface TypeDoc {
  keyPrefix: 'text' | 'dialogue' | 'scene' | 'note';
  /** Color sits on the glyph + name only. Card border is the shared
   *  neutral so the help-card grid stops reading as four-color chrome. */
  iconColor: string;
  icon: string;
  useForCount: number;
  noteCount: number;
}

const DOCS: TypeDoc[] = [
  { keyPrefix: 'text',     iconColor: 'text-violet-500', icon: '¶',  useForCount: 3, noteCount: 3 },
  { keyPrefix: 'dialogue', iconColor: 'text-teal-600',   icon: '“”', useForCount: 2, noteCount: 5 },
  { keyPrefix: 'scene',    iconColor: 'text-orange-600', icon: '◇',  useForCount: 3, noteCount: 4 },
  { keyPrefix: 'note',     iconColor: 'text-stone-400',  icon: '★',  useForCount: 4, noteCount: 4 },
];

// Sentinel used to splice the animated/styled <code> element back into
// the translated intro string around the {{menu}} placeholder.
const MENU_TOKEN = '\u0001MENU\u0001';

export const BlockTypesHelp = () => (
  <Show when={uiState.blockTypesHelpOpen}>
    <ModalBackdrop onClick={() => setBlockTypesHelpOpen(false)}>
      <div
        class="w-[640px] max-w-[92vw] max-h-[85vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
          <div>
            <div class="text-[10px] inkmirror-smallcaps text-stone-400">
              {t('blockTypesHelp.header')}
            </div>
            <h2 class="font-serif text-lg font-normal text-stone-800 dark:text-stone-100">
              {t('blockTypesHelp.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setBlockTypesHelpOpen(false)}
            class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            aria-label={t('blockTypesHelp.closeLabel')}
          >
            ×
          </button>
        </div>

        <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
          <div class="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            {(() => {
              const raw = t('blockTypesHelp.intro', { menu: MENU_TOKEN });
              const [before, after] = raw.split(MENU_TOKEN);
              return (
                <>
                  {before}
                  <code class="font-mono text-[11px] px-1 rounded bg-stone-100 dark:bg-stone-700">⋯</code>
                  {after}
                </>
              );
            })()}
          </div>

          <For each={DOCS}>
            {(doc) => {
              const useForItems = Array.from({ length: doc.useForCount }, (_, i) =>
                t(`blockTypesHelp.${doc.keyPrefix}.useFor${i + 1}`),
              );
              const noteItems = Array.from({ length: doc.noteCount }, (_, i) =>
                t(`blockTypesHelp.${doc.keyPrefix}.note${i + 1}`),
              );
              return (
                <div class="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                  <div class="flex items-baseline gap-3 mb-2">
                    <span class={`font-serif text-2xl ${doc.iconColor}`}>{doc.icon}</span>
                    <div>
                      <div class={`text-[10px] inkmirror-smallcaps ${doc.iconColor}`}>
                        {t(`blockTypesHelp.${doc.keyPrefix}.name`)}
                      </div>
                      <div class="font-serif text-base text-stone-800 dark:text-stone-100">
                        {t(`blockTypesHelp.${doc.keyPrefix}.tagline`)}
                      </div>
                    </div>
                  </div>
                  <div class="mt-3">
                    <div class="text-[10px] inkmirror-smallcaps text-stone-400 mb-1">
                      {t('blockTypesHelp.useForLabel')}
                    </div>
                    <ul class="text-xs text-stone-700 dark:text-stone-300 list-disc pl-5 space-y-0.5">
                      <For each={useForItems}>{(s) => <li>{s}</li>}</For>
                    </ul>
                  </div>
                  <div class="mt-3">
                    <div class="text-[10px] inkmirror-smallcaps text-stone-400 mb-1">
                      {t('blockTypesHelp.howItBehavesLabel')}
                    </div>
                    <ul class="text-xs text-stone-600 dark:text-stone-400 list-disc pl-5 space-y-0.5">
                      <For each={noteItems}>{(s) => <li>{s}</li>}</For>
                    </ul>
                  </div>
                </div>
              );
            }}
          </For>

          <div class="text-[11px] text-stone-400 italic text-center pt-1">
            {t('blockTypesHelp.tip')}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  </Show>
);
