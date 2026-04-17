import { createSignal, onMount, Show } from 'solid-js';
import { store } from '@/store/document';
import { isDemoDocument } from '@/backup/demo';
import { t } from '@/i18n';

/**
 * One-line notice shown at the top of the editor when the active
 * document is the demo. Dismissible; the dismissal is persisted per-
 * document in localStorage so reopening the demo in the same browser
 * doesn't nag, but deleting + re-importing the demo restores it.
 */

function storageKeyFor(docId: string): string {
  return `inkmirror.demoBannerDismissed.${docId}`;
}

function isDismissed(docId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(storageKeyFor(docId)) === '1';
  } catch {
    return false;
  }
}

function markDismissed(docId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKeyFor(docId), '1');
  } catch {
    /* quota / private mode — banner reappears next visit, no harm */
  }
}

export const DemoBanner = () => {
  const [dismissed, setDismissed] = createSignal(false);

  // Initialize dismissal state on first mount from storage. If the
  // active document changes (user picks a different one), the banner
  // naturally re-renders via the `isDemoDocument` guard.
  onMount(() => {
    const docId = store.document?.id;
    if (docId) setDismissed(isDismissed(docId));
  });

  const visible = () => {
    if (dismissed()) return false;
    const docId = store.document?.id;
    return isDemoDocument(docId);
  };

  const dismiss = () => {
    const docId = store.document?.id;
    if (docId) markDismissed(docId);
    setDismissed(true);
  };

  return (
    <Show when={visible()}>
      <div
        role="note"
        class="flex items-center justify-between gap-3 px-4 py-1.5 text-[12px] inkmirror-paper bg-violet-50/70 dark:bg-violet-900/15 border-b border-violet-200/60 dark:border-violet-500/20 text-stone-600 dark:text-stone-300 font-serif italic"
      >
        <span class="truncate">{t('demo.banner')}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('demo.bannerDismiss')}
          class="text-stone-400 hover:text-violet-500 shrink-0 px-1 text-base leading-none not-italic"
        >
          ×
        </button>
      </div>
    </Show>
  );
};
