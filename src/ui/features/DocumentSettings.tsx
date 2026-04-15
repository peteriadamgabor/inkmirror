import { Show } from 'solid-js';
import { uiState, setDocumentSettingsOpen } from '@/store/ui-state';
import { store, updateDocumentMeta } from '@/store/document';

export const DocumentSettings = () => {
  const doc = () => store.document;

  return (
    <Show when={uiState.documentSettingsOpen && doc()}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
        onClick={() => setDocumentSettingsOpen(false)}
      >
        <div
          class="w-[520px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-stone-400">
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

          <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] uppercase tracking-wider text-stone-400">
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
              <label class="text-[10px] uppercase tracking-wider text-stone-400">
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
              <label class="text-[10px] uppercase tracking-wider text-stone-400">
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

            <div class="pt-2 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between text-[10px] text-stone-400">
              <span>Changes save automatically</span>
              <span class="font-mono">id: {doc()?.id.slice(0, 8)}…</span>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
