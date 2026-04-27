import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { t, lang } from '@/i18n';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { whatsNewOpen, closeWhatsNew } from '@/store/whats-new';
import { whatsNewEntries } from '@/i18n/whats-new';

const EXIT_MS = 170;

/**
 * "What's new" panel — flat, scrollable list of recent changelog
 * entries, with a footer that surfaces the build identity baked in
 * by vite (commit + build date). Mirrors SettingsModal's open/close
 * animation and Escape handling so the two feel like siblings.
 */
export const WhatsNewModal = () => {
  const [closing, setClosing] = createSignal(false);

  function requestClose() {
    if (closing()) return;
    setClosing(true);
    setTimeout(() => {
      closeWhatsNew();
      setClosing(false);
    }, EXIT_MS);
  }

  // Reopen-during-exit guard, copied from SettingsModal.
  createEffect(() => {
    if (whatsNewOpen() && closing()) setClosing(false);
  });

  let panelRef: HTMLDivElement | undefined;
  let focusBeforeOpen: HTMLElement | null = null;

  createEffect(() => {
    if (!whatsNewOpen()) return;
    focusBeforeOpen = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (closing()) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    queueMicrotask(() => panelRef?.focus());

    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      const target = focusBeforeOpen;
      focusBeforeOpen = null;
      if (target && typeof target.focus === 'function') {
        queueMicrotask(() => target.focus());
      }
    });
  });

  // Format the build date in the user's current locale. Memoised
  // implicitly via Solid — recomputes when `lang()` changes.
  const formattedDate = () => {
    try {
      return new Date(__APP_BUILT_AT__).toLocaleDateString(lang(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return __APP_BUILT_AT__;
    }
  };

  return (
    <Show when={whatsNewOpen()}>
      <ModalBackdrop closing={closing()} onClick={requestClose}>
        <div
          ref={panelRef}
          tabindex="-1"
          class="w-[520px] max-w-[92vw] max-h-[80vh] bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel focus:outline-none"
          classList={{ 'inkmirror-modal-panel-exit': closing() }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('whatsNew.title')}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('whatsNew.title')}
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                v{__APP_VERSION__}
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          <section class="flex-1 overflow-auto px-5 py-4 space-y-5">
            <Show
              when={whatsNewEntries().length > 0}
              fallback={
                <div class="text-sm text-stone-500 dark:text-stone-400">
                  {t('whatsNew.empty')}
                </div>
              }
            >
              <For each={whatsNewEntries()}>
                {(entry) => (
                  <article>
                    <h3 class="font-serif text-base text-stone-800 dark:text-stone-100 mb-1.5">
                      {entry.title}
                    </h3>
                    <ul class="space-y-1.5 text-sm text-stone-600 dark:text-stone-300 list-disc pl-5">
                      <For each={entry.items}>
                        {(item) => <li>{item}</li>}
                      </For>
                    </ul>
                  </article>
                )}
              </For>
            </Show>
          </section>

          <div class="px-5 py-2.5 border-t border-stone-200 dark:border-stone-700 text-[10px] text-stone-400 tabular-nums">
            {t('whatsNew.footer', {
              commit: __APP_COMMIT__,
              date: formattedDate(),
            })}
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};
