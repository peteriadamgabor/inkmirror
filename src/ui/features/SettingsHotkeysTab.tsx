import { createSignal, For, onCleanup } from 'solid-js';
import { toast } from '@/ui/shared/toast';
import {
  BINDING_META,
  hotkeys,
  setHotkey,
  resetHotkeys,
  comboFromEvent,
  isModifierOnly,
  type AppAction,
} from '@/store/hotkeys';
import { t } from '@/i18n';
import {
  BLOCK_KEY_META,
  BLOCK_KEY_SECTION_ORDER,
  type BlockKeySection,
} from './block-keys-meta';

export const SettingsHotkeysTab = () => {
  const [capturing, setCapturing] = createSignal<AppAction | null>(null);
  let currentFinish: (() => void) | null = null;

  // If the modal closes mid-capture, the tab unmounts; clear the
  // capture state and remove the listener so we don't leak it.
  onCleanup(() => currentFinish?.());

  const labelFor = (action: AppAction) => {
    const meta = BINDING_META.find((m) => m.action === action);
    return meta ? t(meta.labelKey as Parameters<typeof t>[0]) : action;
  };

  function startCapture(action: AppAction) {
    currentFinish?.();
    setCapturing(action);
    document.body.dataset.hotkeyCapture = '1';

    const onKey = (e: KeyboardEvent) => {
      if (isModifierOnly(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        finish();
        return;
      }
      const combo = comboFromEvent(e);
      const clash = (Object.entries(hotkeys) as [AppAction, string][]).find(
        ([a, c]) => c === combo && a !== action,
      );
      if (clash) {
        const previousCombo = hotkeys[action];
        setHotkey(clash[0], previousCombo);
        toast.info(t('toast.hotkeySwapped', { label: labelFor(clash[0]) }));
      }
      setHotkey(action, combo);
      finish();
    };

    const finish = () => {
      setCapturing(null);
      delete document.body.dataset.hotkeyCapture;
      window.removeEventListener('keydown', onKey, true);
      currentFinish = null;
    };

    currentFinish = finish;
    window.addEventListener('keydown', onKey, true);
  }

  function onResetHotkeys() {
    resetHotkeys();
    toast.success(t('hotkeys.reset'));
  }

  return (
    <>
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
            {t('hotkeys.title')}
          </h2>
          <p class="text-sm text-stone-600 dark:text-stone-400">
            {t('hotkeys.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onResetHotkeys}
          class="text-[11px] text-stone-500 hover:text-violet-500 transition-colors inkmirror-smallcaps shrink-0 ml-4"
        >
          {t('hotkeys.reset')}
        </button>
      </div>
      <div class="flex flex-col gap-0.5">
        <For each={BINDING_META}>
          {(meta) => {
            const isCapturing = () => capturing() === meta.action;
            return (
              <div class="flex items-center justify-between gap-4 py-2.5 border-b border-stone-200 dark:border-stone-700 last:border-b-0">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-stone-900 dark:text-stone-50">
                    {t(meta.labelKey as Parameters<typeof t>[0])}
                  </div>
                  <div class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {t(meta.descriptionKey as Parameters<typeof t>[0])}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startCapture(meta.action)}
                  class="font-mono text-xs px-3 py-1.5 rounded-lg border-2 transition-colors shrink-0 min-w-[130px] text-center bg-stone-50 dark:bg-stone-900/50"
                  classList={{
                    'border-violet-500 text-violet-500 bg-violet-50 dark:bg-violet-950/30 animate-pulse':
                      isCapturing(),
                    'border-stone-200 dark:border-stone-600 text-stone-800 dark:text-stone-100 hover:border-violet-500 hover:text-violet-500':
                      !isCapturing(),
                  }}
                >
                  {isCapturing() ? t('hotkeys.pressKey') : hotkeys[meta.action]}
                </button>
              </div>
            );
          }}
        </For>
      </div>

      <div class="mt-8">
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('hotkeys.blockTitle')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3">
          {t('hotkeys.blockSubtitle')}
        </p>
        <For each={BLOCK_KEY_SECTION_ORDER}>
          {(section: BlockKeySection) => {
            const rows = BLOCK_KEY_META.filter((k) => k.section === section);
            return (
              <div class="mb-4">
                <div class="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                  {t(`hotkeys.sections.${section}`)}
                </div>
                <div class="flex flex-col gap-0.5">
                  <For each={rows}>
                    {(row) => (
                      <div class="flex items-center justify-between gap-4 py-2 border-b border-stone-200 dark:border-stone-700 last:border-b-0">
                        <div class="flex-1 min-w-0 text-sm text-stone-700 dark:text-stone-200">
                          {t(row.labelKey)}
                        </div>
                        <div class="font-mono text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 shrink-0 min-w-[130px] text-center bg-stone-50 dark:bg-stone-900/50">
                          {row.combo}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
};
