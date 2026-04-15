import { Show, onCleanup, onMount } from 'solid-js';
import { pendingConfirm, resolveConfirm } from './confirm';

export const ConfirmHost = () => {
  const onKey = (e: KeyboardEvent) => {
    const p = pendingConfirm();
    if (!p) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveConfirm(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveConfirm(true);
    }
  };
  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  return (
    <Show when={pendingConfirm()}>
      {(p) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm"
          onClick={() => resolveConfirm(false)}
        >
          <div
            class="w-[420px] max-w-[90vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div>
              <div
                id="confirm-title"
                class="font-serif text-lg text-stone-900 dark:text-stone-100"
              >
                {p().title}
              </div>
              <div class="text-sm text-stone-600 dark:text-stone-400 mt-1 leading-relaxed whitespace-pre-wrap">
                {p().message}
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                class="px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              >
                {p().cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                class="px-3 py-1.5 text-sm rounded-lg text-white transition-colors"
                classList={{
                  'bg-red-500 hover:bg-red-600': p().danger === true,
                  'bg-violet-500 hover:bg-violet-600': p().danger !== true,
                }}
              >
                {p().confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
