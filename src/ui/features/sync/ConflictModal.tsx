// src/ui/features/sync/ConflictModal.tsx
import { Show } from 'solid-js';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { resolveConflict } from '@/sync';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';
import { formatEditedTimestamp } from '@/utils/block-timestamp';

interface Props {
  docId: string;
  docTitle: string;
  localRevision: number;
  serverRevision: number;
  localUpdatedAt: number;   // ms epoch
  serverUpdatedAt: number;  // ms epoch
  onClose: () => void;
  onSaveAsCopy?: () => void;
}

export function ConflictModal(props: Props) {
  const ago = (ms: number) => formatEditedTimestamp(new Date(ms).toISOString());

  async function choose(choice: 'keepLocal' | 'pullServer' | 'decideLater') {
    try {
      await resolveConflict(props.docId, choice);
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <ModalBackdrop onClick={props.onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 max-w-md w-full mx-4 inkmirror-modal-panel"
      >
        <h2 class="font-semibold text-lg text-stone-900 dark:text-stone-100 mb-2">
          {t('sync.conflict.title')}
        </h2>
        <p class="text-sm text-stone-700 dark:text-stone-300 mb-4">
          {t('sync.conflict.intro', { title: props.docTitle })}
        </p>

        <div class="text-sm tabular-nums text-stone-700 dark:text-stone-300 mb-1">
          <span class="font-medium">{t('sync.conflict.localLabel')}</span>
          {' · '}
          {t('sync.conflict.revisionAgo', { rev: props.localRevision, ago: ago(props.localUpdatedAt) })}
        </div>
        <div class="text-sm tabular-nums text-stone-700 dark:text-stone-300 mb-4">
          <span class="font-medium">{t('sync.conflict.serverLabel')}</span>
          {' · '}
          {t('sync.conflict.revisionAgo', { rev: props.serverRevision, ago: ago(props.serverUpdatedAt) })}
        </div>

        <p class="text-xs text-stone-500 dark:text-stone-400 mb-5">
          ⚠ {t('sync.conflict.warn')}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="text-left px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
            onClick={() => choose('keepLocal')}
          >
            {t('sync.conflict.keepLocal')}
          </button>
          <button
            class="text-left px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
            onClick={() => choose('pullServer')}
          >
            {t('sync.conflict.pullServer')}
          </button>
          <Show when={props.onSaveAsCopy !== undefined}>
            <button
              class="text-left px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
              onClick={() => { props.onSaveAsCopy?.(); props.onClose(); }}
            >
              {t('sync.conflict.saveAsCopy')}{' '}
              <span class="text-xs text-stone-500 dark:text-stone-400">
                {t('sync.conflict.saveAsCopyRecommended')}
              </span>
            </button>
          </Show>
          <button
            class="text-left px-3 py-2 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            onClick={() => choose('decideLater')}
          >
            {t('sync.conflict.decideLater')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
