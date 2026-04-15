import { createSignal, For, onCleanup, Show } from 'solid-js';
import { uiState, setHotkeysModalOpen } from '@/store/ui-state';
import {
  BINDING_META,
  hotkeys,
  setHotkey,
  resetHotkeys,
  comboFromEvent,
  isModifierOnly,
  type AppAction,
} from '@/store/hotkeys';
import { toast } from '@/ui/shared/toast';

export const HotkeysModal = () => {
  const [capturing, setCapturing] = createSignal<AppAction | null>(null);

  const startCapture = (action: AppAction) => {
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
      // Clash detection: if another action already owns this combo, swap
      // them so we don't silently orphan the other binding.
      const clash = (Object.entries(hotkeys) as [AppAction, string][]).find(
        ([a, c]) => c === combo && a !== action,
      );
      if (clash) {
        const previousCombo = hotkeys[action];
        setHotkey(clash[0], previousCombo);
        toast.info(`Swapped with "${labelFor(clash[0])}"`);
      }
      setHotkey(action, combo);
      finish();
    };

    const finish = () => {
      setCapturing(null);
      delete document.body.dataset.hotkeyCapture;
      window.removeEventListener('keydown', onKey, true);
    };

    window.addEventListener('keydown', onKey, true);
    onCleanup(finish);
  };

  const labelFor = (action: AppAction) =>
    BINDING_META.find((m) => m.action === action)?.label ?? action;

  const onReset = () => {
    resetHotkeys();
    toast.success('Hotkeys reset to defaults');
  };

  return (
    <Show when={uiState.hotkeysModalOpen}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
        onClick={() => setHotkeysModalOpen(false)}
      >
        <div
          class="w-[560px] max-w-[92vw] max-h-[80vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-stone-400">Settings</div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">Hotkeys</div>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={onReset}
                class="text-[10px] uppercase tracking-wider text-stone-400 hover:text-violet-500 transition-colors"
              >
                Reset defaults
              </button>
              <button
                type="button"
                onClick={() => setHotkeysModalOpen(false)}
                class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-auto px-5 py-4">
            <div class="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed">
              Click any combo to rebind. Press <code class="font-mono text-[10px] px-1 rounded bg-stone-100 dark:bg-stone-700">Esc</code> to cancel. Clashes swap bindings between actions.
            </div>
            <div class="flex flex-col gap-1">
              <For each={BINDING_META}>
                {(meta) => {
                  const isCapturing = () => capturing() === meta.action;
                  return (
                    <div class="flex items-center justify-between gap-3 py-2 border-b border-stone-100 dark:border-stone-700/50 last:border-b-0">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm text-stone-800 dark:text-stone-100">
                          {meta.label}
                        </div>
                        <div class="text-[11px] text-stone-500 dark:text-stone-400">
                          {meta.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startCapture(meta.action)}
                        class="font-mono text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 hover:border-violet-500 hover:text-violet-500 transition-colors shrink-0 min-w-[110px] text-center"
                        classList={{
                          'border-violet-500 text-violet-500 animate-pulse': isCapturing(),
                        }}
                      >
                        {isCapturing() ? 'press key…' : hotkeys[meta.action]}
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
