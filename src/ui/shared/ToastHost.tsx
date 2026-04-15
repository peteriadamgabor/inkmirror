import { For } from 'solid-js';
import { toasts, dismissToast, type ToastKind } from './toast';

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100',
  success: 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-300',
};

const KIND_ICON: Record<ToastKind, string> = {
  info: '·',
  success: '✓',
  error: '!',
};

export const ToastHost = () => (
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
    <For each={toasts()}>
      {(t) => (
        <div
          class={`pointer-events-auto px-4 py-2.5 rounded-xl border bg-white/95 dark:bg-stone-800/95 backdrop-blur-sm shadow-lg min-w-[220px] max-w-[360px] text-sm flex items-start gap-2 ${KIND_STYLES[t.kind]}`}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          <span class="font-mono text-xs mt-0.5 opacity-70 shrink-0 w-3">{KIND_ICON[t.kind]}</span>
          <span class="flex-1 break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            class="opacity-40 hover:opacity-100 text-xs leading-none w-4 h-4 shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </For>
  </div>
);
