import { Show } from 'solid-js';
import { docStatusFor } from '@/sync';
import { t } from '@/i18n';
import { formatEditedTimestamp } from '@/utils/block-timestamp';

interface Props {
  docId: string;
  onClickConflict?: () => void;
}

export function SyncStatusPill(props: Props) {
  const status = () => docStatusFor(props.docId);

  return (
    <Show when={status().kind !== 'off'}>
      {(() => {
        const s = status();

        if (s.kind === 'idle') {
          return (
            <span class="text-stone-500 dark:text-stone-400 text-xs tabular-nums">
              ✓ {t('sync.status.idle', { ago: formatEditedTimestamp(new Date(s.lastSyncedAt).toISOString()) })}
            </span>
          );
        }

        if (s.kind === 'syncing') {
          return (
            <span class="text-violet-500 text-xs">
              ⟳ {t('sync.status.syncing')}
            </span>
          );
        }

        if (s.kind === 'pending') {
          return (
            <span class="text-stone-500 dark:text-stone-400 text-xs">
              {t('sync.status.pending')}
            </span>
          );
        }

        if (s.kind === 'conflict') {
          return (
            <button
              class="text-orange-600 text-xs cursor-pointer"
              onClick={props.onClickConflict}
            >
              ⚠ {t('sync.status.conflict')}
            </button>
          );
        }

        if (s.kind === 'error') {
          return (
            <span class="text-red-500 text-xs">
              ! {t('sync.status.error')}
            </span>
          );
        }

        return null;
      })()}
    </Show>
  );
}
