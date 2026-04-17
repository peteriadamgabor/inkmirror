import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { store } from '@/store/document';
import { t } from '@/i18n';

/**
 * Per-document scratchpad for writer-to-self notes. Deliberately NOT
 * part of the manuscript data model — lives in localStorage under
 * `inkmirror.sessionNotes.<documentId>`, so it travels with the user's
 * browser, not with the .inkmirror.json bundle. Export-invisible by
 * design.
 */

const STORAGE_PREFIX = 'inkmirror.sessionNotes.';
const SAVE_DEBOUNCE_MS = 400;

function storageKey(documentId: string): string {
  return `${STORAGE_PREFIX}${documentId}`;
}

function readNotes(documentId: string): string {
  try {
    return localStorage.getItem(storageKey(documentId)) ?? '';
  } catch {
    return '';
  }
}

function writeNotes(documentId: string, value: string): void {
  try {
    if (value.length === 0) {
      localStorage.removeItem(storageKey(documentId));
    } else {
      localStorage.setItem(storageKey(documentId), value);
    }
  } catch {
    // ignore quota / privacy-mode failures
  }
}

/** Test-only exports for persistence helpers. */
export const __test = { storageKey, readNotes, writeNotes };

export const SessionNotes = () => {
  const [text, setText] = createSignal('');
  const [justSaved, setJustSaved] = createSignal(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let savedIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

  const documentId = createMemo(() => store.document?.id ?? null);

  // Re-read when the active document changes — each doc has its own pad.
  createEffect(
    on(documentId, (docId) => {
      if (!docId) {
        setText('');
        return;
      }
      setText(readNotes(docId));
    }),
  );

  function onInput(value: string) {
    setText(value);
    const docId = documentId();
    if (!docId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeNotes(docId, value);
      setJustSaved(true);
      if (savedIndicatorTimer) clearTimeout(savedIndicatorTimer);
      savedIndicatorTimer = setTimeout(() => setJustSaved(false), 1200);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <Show when={documentId()}>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
            {t('sessionNotes.title')}
          </div>
          <Show when={justSaved()}>
            <span class="text-[9px] text-stone-400 inkmirror-smallcaps opacity-70">
              {t('sessionNotes.savedHint')}
            </span>
          </Show>
        </div>
        <textarea
          class="w-full min-h-[96px] max-h-[200px] resize-y px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:border-violet-400 dark:focus:border-violet-500 outline-none transition-colors"
          placeholder={t('sessionNotes.placeholder')}
          value={text()}
          onInput={(e) => onInput(e.currentTarget.value)}
          spellcheck={false}
        />
      </div>
    </Show>
  );
};
