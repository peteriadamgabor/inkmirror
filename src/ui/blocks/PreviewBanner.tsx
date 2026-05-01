import { onCleanup, onMount } from 'solid-js';
import { previewState, exitPreview, commitPreview } from '@/store/preview';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

function formatRelative(iso: string, now: number): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const s = Math.round(Math.max(0, now - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PreviewBanner() {
  const ago = () => {
    const s = previewState();
    return s ? formatRelative(s.snapshotAt, Date.now()) : '';
  };

  const onRestore = async () => {
    const ts = ago();
    try {
      await commitPreview();
      toast.success(t('block.previewRestoredToast', { ago: ts }));
    } catch {
      // commitPreview already cleared preview state on failure (Task 8 fix).
      // Surface the failure to the user; specific error text is generic since
      // the underlying IDB error message would not help a writer.
      toast.error(t('block.previewRestoreFailedToast'));
    }
  };

  const onCancel = () => {
    exitPreview();
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewState()) {
        e.preventDefault();
        exitPreview();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <div
      class="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-t-lg bg-violet-50 dark:bg-violet-950/40 border-b border-violet-200 dark:border-violet-800 shadow-sm"
      role="status"
    >
      <span class="text-xs text-violet-700 dark:text-violet-300 italic">
        {t('block.previewBanner', { ago: ago() })}
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          class="text-xs px-2 py-0.5 rounded text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          {t('block.previewCancel')}
        </button>
        <button
          type="button"
          onClick={() => void onRestore()}
          class="text-xs px-2 py-0.5 rounded bg-violet-500 text-white hover:bg-violet-600"
        >
          {t('block.previewRestore')}
        </button>
      </div>
    </div>
  );
}
