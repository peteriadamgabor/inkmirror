import { createResource, createSignal, For, Show, createEffect, onCleanup } from 'solid-js';
import type { UUID } from '@/types';
import { loadBlockRevisions, store } from '@/store/document';
import { enterPreview, previewState } from '@/store/preview';
import { IconHistory } from '@/ui/shared/icons';
import { t } from '@/i18n';
import { BlockHistoryRow } from './BlockHistoryRow';
import type { BlockRevision } from '@/db/repository-revisions';

export const BlockHistory = (props: { blockId: UUID }) => {
  const [open, setOpen] = createSignal(false);
  const [version, setVersion] = createSignal(0);
  let popoverEl: HTMLDivElement | undefined;

  // Dismiss on outside click, scroll, or Esc — anchoring to the block
  // wrapper means any scroll would drift the popover, so we just close.
  createEffect(() => {
    if (!open()) return;
    const onOutside = (e: MouseEvent) => {
      if (popoverEl && e.target instanceof Node && popoverEl.contains(e.target)) return;
      setOpen(false);
    };
    const onWheel = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onOutside, true);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    });
  });

  const [revisions] = createResource(
    () => (open() ? [props.blockId, version()] : null),
    async (k) => {
      if (!k) return [];
      return loadBlockRevisions(props.blockId);
    },
  );

  const onToggle = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
    if (!open()) setVersion((v) => v + 1);
  };

  const onSelect = (rev: BlockRevision) => {
    enterPreview(props.blockId, rev.content, rev.snapshotAt);
    setOpen(false);
  };

  return (
    <div class="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        title={t('misc.revisionHistory')}
        class="text-stone-400 hover:text-violet-500 px-1 leading-none"
        aria-label={t('aria.blockHistory')}
      >
        <IconHistory size={13} />
      </button>
      <Show when={open()}>
        <div
          ref={popoverEl}
          class="absolute left-0 top-5 z-20 w-[340px] max-h-[320px] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400 px-2 pb-1 pt-1">
            <span>{t('block.historyTitle')}</span>
            <span class="font-normal normal-case tracking-normal text-stone-400/70">
              {(revisions() ?? []).length} / 50
            </span>
          </div>
          <Show
            when={(revisions() ?? []).length > 0}
            fallback={
              <div class="text-xs text-stone-400 italic px-2 py-3">
                {t('block.historyEmpty')}
              </div>
            }
          >
            <div class="flex flex-col">
              <For each={revisions()}>
                {(r, i) => {
                  const prev = () => revisions()?.[i() + 1];
                  const isThisPreview = () =>
                    previewState()?.blockId === props.blockId &&
                    previewState()?.snapshotAt === r.snapshotAt;
                  return (
                    <BlockHistoryRow
                      rev={r}
                      prev={prev()}
                      liveContent={store.blocks[props.blockId]?.content ?? ''}
                      isPreviewing={isThisPreview()}
                      onSelect={onSelect}
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
