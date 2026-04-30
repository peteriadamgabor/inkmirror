import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { t, lang } from '@/i18n';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { whatsNewOpen, closeWhatsNew } from '@/store/whats-new';
import { LATEST_WHATS_NEW_ID, whatsNewEntries, type WhatsNewEntry } from '@/i18n/whats-new';

const EXIT_MS = 170;

// Pull the leading version token (e.g. "v0.1.0") out of an entry title.
// Falls back to the id (date string) so older or malformed entries
// still get a sensible tab label.
const versionLabel = (entry: WhatsNewEntry): string => {
  const match = entry.title.match(/^(v\d+(?:\.\d+){1,2})/);
  return match ? match[1] : entry.id;
};

/**
 * "What's new" panel — left rail of versions (newest-first), right
 * pane shows that single version's items. Mirrors SettingsModal's
 * tab layout so the two feel like siblings.
 */
export const WhatsNewModal = () => {
  const [closing, setClosing] = createSignal(false);
  const [activeId, setActiveId] = createSignal(LATEST_WHATS_NEW_ID);

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

  // Default to the latest version every time the panel opens, so
  // unread users land on the freshest tab without manual resets.
  createEffect(() => {
    if (whatsNewOpen()) setActiveId(LATEST_WHATS_NEW_ID);
  });

  // Tabs are a memo so swapping the language re-renders labels
  // without losing the active selection (ids are locale-independent).
  const tabs = createMemo<WhatsNewEntry[]>(() => whatsNewEntries());

  // Keep activeId valid if the locale change yields a list that
  // somehow doesn't contain the previously-active id (shouldn't
  // normally happen — ids are shared across locales — but cheap to guard).
  createEffect(() => {
    const list = tabs();
    if (list.length === 0) return;
    if (!list.some((e) => e.id === activeId())) {
      setActiveId(list[0].id);
    }
  });

  const activeEntry = createMemo<WhatsNewEntry | undefined>(() =>
    tabs().find((e) => e.id === activeId()),
  );

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
          class="w-[640px] max-w-[92vw] h-[520px] max-h-[80vh] bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel focus:outline-none"
          classList={{ 'inkmirror-modal-panel-exit': closing() }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('whatsNew.title')}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div class="min-w-0">
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('whatsNew.title')}
              </div>
              <h2 class="font-serif text-lg font-normal text-stone-800 dark:text-stone-100 truncate">
                {activeEntry()?.title ?? `v${__APP_VERSION__}`}
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shrink-0 ml-3"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          <Show
            when={tabs().length > 0}
            fallback={
              <section class="flex-1 overflow-auto px-5 py-4">
                <div class="text-sm text-stone-500 dark:text-stone-400">
                  {t('whatsNew.empty')}
                </div>
              </section>
            }
          >
            <div class="flex-1 flex min-h-0 overflow-hidden">
              <nav class="w-32 shrink-0 border-r border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-1 text-sm overflow-auto">
                <For each={tabs()}>
                  {(entry) => (
                    <button
                      type="button"
                      onClick={() => setActiveId(entry.id)}
                      class="text-left px-3 py-2 rounded-lg transition-colors tabular-nums"
                      classList={{
                        'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 font-semibold':
                          activeId() === entry.id,
                        'hover:bg-stone-100 dark:hover:bg-stone-700':
                          activeId() !== entry.id,
                      }}
                    >
                      {versionLabel(entry)}
                    </button>
                  )}
                </For>
              </nav>

              <section class="flex-1 overflow-auto px-5 py-4">
                <Show when={activeEntry()}>
                  {(entry) => (
                    <ul class="space-y-1.5 text-sm text-stone-600 dark:text-stone-300 list-disc pl-5">
                      <For each={entry().items}>
                        {(item) => <li>{item}</li>}
                      </For>
                    </ul>
                  )}
                </Show>
              </section>
            </div>
          </Show>

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
