import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { t } from '@/i18n';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import {
  uiState,
  setSettingsModalOpen,
  setSettingsModalTab,
  type SettingsModalTab,
} from '@/store/ui-state';
import { SettingsAiTab } from './SettingsAiTab';
import { SettingsHotkeysTab } from './SettingsHotkeysTab';
import { SettingsLanguageTab } from './SettingsLanguageTab';

interface SidebarTab {
  id: SettingsModalTab;
  label: string;
}

export const SettingsModal = () => {
  const activeTab = () => uiState.settingsModalTab;
  // `closing` stays true for the duration of the exit animation so the
  // backdrop/panel can play their fade-out before the Show unmounts.
  const [closing, setClosing] = createSignal(false);
  const EXIT_MS = 170;

  function requestClose() {
    if (closing()) return;
    setClosing(true);
    setTimeout(() => {
      setSettingsModalOpen(false);
      setClosing(false);
    }, EXIT_MS);
  }

  // If the modal gets reopened while an exit was pending (shouldn't
  // normally happen, but opening during animation is cheap to guard),
  // drop the closing flag so the panel stays visible.
  createEffect(() => {
    if (uiState.settingsModalOpen && closing()) {
      setClosing(false);
    }
  });

  // Tabs are a memo so swapping the language re-renders the labels
  // without re-mounting the modal — `t()` reads `lang()` reactively.
  const tabs = createMemo<SidebarTab[]>(() => [
    { id: 'ai', label: t('settings.tabs.ai') },
    { id: 'hotkeys', label: t('settings.tabs.hotkeys') },
    { id: 'language', label: t('settings.tabs.language') },
  ]);

  // Track focus before the modal opens so we can restore it on close —
  // matches the expected behavior of `aria-modal="true"` dialogs.
  let panelRef: HTMLDivElement | undefined;
  let focusBeforeOpen: HTMLElement | null = null;

  // Escape closes the modal. Hotkey-capture mode (inside the Hotkeys tab)
  // installs its own keydown listener with `capture: true` and stops
  // propagation, so this bubble-phase handler never fires while a key
  // is being captured — no extra guard needed here.
  createEffect(() => {
    if (!uiState.settingsModalOpen) return;
    focusBeforeOpen = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (closing()) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // Move focus to the panel so screen readers announce the dialog
    // and keyboard users land inside it instead of on <body>.
    queueMicrotask(() => panelRef?.focus());

    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever the user was on before opening.
      const target = focusBeforeOpen;
      focusBeforeOpen = null;
      if (target && typeof target.focus === 'function') {
        queueMicrotask(() => target.focus());
      }
    });
  });

  return (
    <Show when={uiState.settingsModalOpen}>
      <ModalBackdrop closing={closing()} onClick={requestClose}>
        <div
          ref={panelRef}
          tabindex="-1"
          class="w-[760px] max-w-[92vw] h-[620px] max-h-[86vh] bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel focus:outline-none"
          classList={{ 'inkmirror-modal-panel-exit': closing() }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('settings.title')}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('settings.title')}
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                {tabs().find((tb) => tb.id === activeTab())?.label}
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

          <div class="flex-1 flex min-h-0 overflow-hidden">
            <nav class="w-44 shrink-0 border-r border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-1 text-sm overflow-auto">
              <For each={tabs()}>
                {(tab) => (
                  <button
                    type="button"
                    onClick={() => setSettingsModalTab(tab.id)}
                    class="text-left px-3 py-2 rounded-lg transition-colors"
                    classList={{
                      'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 font-semibold':
                        activeTab() === tab.id,
                      'hover:bg-stone-100 dark:hover:bg-stone-700':
                        activeTab() !== tab.id,
                    }}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </nav>

            <section class="flex-1 overflow-auto p-5 space-y-5">
              <Show when={activeTab() === 'ai'}>
                <SettingsAiTab />
              </Show>
              <Show when={activeTab() === 'hotkeys'}>
                <SettingsHotkeysTab />
              </Show>
              <Show when={activeTab() === 'language'}>
                <SettingsLanguageTab />
              </Show>
            </section>
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};
