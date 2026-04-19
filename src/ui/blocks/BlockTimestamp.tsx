import { Show } from 'solid-js';
import { t } from '@/i18n';
import { formatFullTimestamp, formatEditedTimestamp } from '@/utils/block-timestamp';
import type { ISODateTime } from '@/types';

interface Props {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export function BlockTimestamp(props: Props) {
  const wasEdited = () => props.updatedAt !== props.createdAt;
  return (
    <div
      class="inkmirror-smallcaps tabular-nums absolute right-4 bottom-1 text-[10px] text-stone-400 dark:text-stone-500 opacity-0 group-hover/block:opacity-100 group-focus-within/block:opacity-100 transition-opacity duration-150 motion-reduce:transition-none pointer-events-none select-none"
    >
      <span>
        {t('block.addedPrefix')}{' '}
        <time datetime={props.createdAt}>{formatFullTimestamp(props.createdAt)}</time>
      </span>
      <Show when={wasEdited()}>
        <span class="opacity-50 mx-1.5">·</span>
        <span>
          {t('block.editedPrefix')}{' '}
          <time datetime={props.updatedAt}>{formatEditedTimestamp(props.updatedAt)}</time>
        </span>
      </Show>
    </div>
  );
}
