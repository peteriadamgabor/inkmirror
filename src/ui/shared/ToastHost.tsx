import { createSignal, For, Show, type JSX } from 'solid-js';
import { toasts, toastHistory, dismissToast, clearToastHistory, type ToastKind } from './toast';
import { IconInfo, IconCheck, IconAlert, IconHistory } from './icons';
import { t } from '@/i18n';

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100',
  success: 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-300',
};

const KIND_ICON: Record<ToastKind, () => JSX.Element> = {
  info: () => <IconInfo size={14} />,
  success: () => <IconCheck size={14} />,
  error: () => <IconAlert size={14} />,
};

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export const ToastHost = () => {
  const [historyOpen, setHistoryOpen] = createSignal(false);

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {/* Active toasts */}
      <For each={toasts()}>
        {(t) => (
          <div
            class={`pointer-events-auto px-4 py-2.5 rounded-xl border bg-white/95 dark:bg-stone-800/95 backdrop-blur-sm shadow-lg min-w-[220px] max-w-[360px] text-sm flex items-start gap-2 ${KIND_STYLES[t.kind]}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span class="mt-0.5 opacity-80 shrink-0 inline-flex">{KIND_ICON[t.kind]()}</span>
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

      {/* History toggle — only shows when there's history and no active toasts */}
      <Show when={toastHistory().length > 0 && toasts().length === 0}>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          class="pointer-events-auto w-8 h-8 rounded-full bg-white/80 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 shadow-sm flex items-center justify-center text-stone-400 hover:text-violet-500 transition-colors"
          title={t('misc.recentActivity')}
          aria-label={t('misc.recentActivity')}
        >
          <IconHistory size={14} />
        </button>
      </Show>

      {/* History popover */}
      <Show when={historyOpen()}>
        <div class="pointer-events-auto w-[300px] max-h-[280px] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl p-2">
          <div class="flex items-center justify-between px-2 pb-1">
            <span class="text-[10px] uppercase tracking-wider text-stone-400">
              Recent activity
            </span>
            <button
              type="button"
              onClick={() => {
                clearToastHistory();
                setHistoryOpen(false);
              }}
              class="text-[10px] text-stone-400 hover:text-violet-500"
            >
              clear
            </button>
          </div>
          <div class="flex flex-col">
            <For each={toastHistory()}>
              {(entry) => (
                <div class="flex items-start gap-2 px-2 py-1.5 rounded text-xs text-stone-600 dark:text-stone-300">
                  <span class="mt-0.5 opacity-60 shrink-0 inline-flex">
                    {KIND_ICON[entry.kind]()}
                  </span>
                  <span class="flex-1 break-words">{entry.message}</span>
                  <span class="text-[10px] text-stone-400 shrink-0">
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};
