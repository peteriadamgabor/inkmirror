import { For, Show } from 'solid-js';
import { uiState, setDocumentSettingsOpen } from '@/store/ui-state';
import {
  store,
  updateDocumentMeta,
  updateDocumentSettings,
} from '@/store/document';
import { DEFAULT_STACK, FONT_STACKS } from '@/ui/fonts';

export const DocumentSettings = () => {
  const doc = () => store.document;
  const currentFontFamily = () =>
    doc()?.settings.font_family ?? DEFAULT_STACK.stack;

  return (
    <Show when={uiState.documentSettingsOpen && doc()}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm inkmirror-modal-backdrop"
        onClick={() => setDocumentSettingsOpen(false)}
      >
        <div
          class="w-[560px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                Metadata
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                Document
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDocumentSettingsOpen(false)}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                Title
              </label>
              <input
                type="text"
                value={doc()?.title ?? ''}
                onInput={(e) =>
                  updateDocumentMeta({ title: e.currentTarget.value })
                }
                placeholder="Untitled"
                class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif text-lg py-1"
              />
              <div class="text-[10px] text-stone-400 mt-0.5">
                Used as the filename for every export and the first line of
                cover exports.
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                Author
              </label>
              <input
                type="text"
                value={doc()?.author ?? ''}
                onInput={(e) =>
                  updateDocumentMeta({ author: e.currentTarget.value })
                }
                placeholder="—"
                class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif py-1"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                Synopsis
              </label>
              <textarea
                value={doc()?.synopsis ?? ''}
                onInput={(e) =>
                  updateDocumentMeta({ synopsis: e.currentTarget.value })
                }
                placeholder="A short summary of the story, for your own reference."
                rows={4}
                class="bg-transparent outline-none border border-stone-200 dark:border-stone-700 rounded-lg focus:border-violet-500 text-stone-800 dark:text-stone-100 text-sm font-serif px-3 py-2 resize-y"
              />
              <div class="text-[10px] text-stone-400 mt-0.5">
                Appears as a blockquote in Markdown exports and as the
                description in DOCX / EPUB metadata.
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                Typeface
              </label>
              <div class="grid grid-cols-2 gap-2">
                <For each={FONT_STACKS}>
                  {(stack) => {
                    const active = () => currentFontFamily() === stack.stack;
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          updateDocumentSettings({ font_family: stack.stack })
                        }
                        class="text-left rounded-lg border px-3 py-2 transition-colors group"
                        classList={{
                          'border-violet-500 bg-violet-50 dark:bg-violet-900/20':
                            active(),
                          'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700':
                            !active(),
                        }}
                      >
                        <div
                          class="text-base text-stone-900 dark:text-stone-100 leading-tight"
                          style={{ 'font-family': stack.stack }}
                        >
                          {stack.label}
                        </div>
                        <div class="text-[10px] text-stone-400 mt-1 leading-snug">
                          {stack.description}
                        </div>
                        <div
                          class="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 italic leading-snug"
                          style={{ 'font-family': stack.stack }}
                        >
                          She read the line twice, weighing it.
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
              <div class="text-[10px] text-stone-400 mt-1">
                System fonts only — no downloads. Falls back to Georgia if
                your platform doesn't have the primary face.
              </div>
            </div>

            <div class="pt-2 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between text-[10px] text-stone-400">
              <span>Changes save automatically</span>
              <span class="font-mono tabular-nums">
                id: {doc()?.id.slice(0, 8)}…
              </span>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
