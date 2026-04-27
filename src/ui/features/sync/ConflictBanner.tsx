// src/ui/features/sync/ConflictBanner.tsx
import { Show } from 'solid-js';
import { docStatusFor } from '@/sync';
import { t } from '@/i18n';

interface Props {
  docId: string;
  onClick: () => void;
}

export function ConflictBanner(props: Props) {
  const isConflict = () => docStatusFor(props.docId).kind === 'conflict';
  return (
    <Show when={isConflict()}>
      <button
        class="w-full bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-sm py-2 px-4 cursor-pointer text-center hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
        onClick={props.onClick}
      >
        ⚠ {t('sync.conflict.banner')}
      </button>
    </Show>
  );
}
