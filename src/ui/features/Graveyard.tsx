import { createEffect, For, Show } from 'solid-js';
import { uiState, setGraveyardOpen } from '@/store/ui-state';
import { graveyardBlocks, refreshGraveyard, restoreBlock } from '@/store/document';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

export const Graveyard = () => {
  createEffect(() => {
    if (uiState.graveyardOpen) {
      void refreshGraveyard();
    }
  });

  const onRestore = async (id: string) => {
    try {
      await restoreBlock(id);
      toast.success(t('graveyard.restore'));
    } catch (err) {
      toast.error(
        t('toast.importFailed', { error: err instanceof Error ? err.message : String(err) }),
      );
    }
  };

  return (
    <Show when={uiState.graveyardOpen}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
        onClick={() => setGraveyardOpen(false)}
      >
        <div
          class="w-[560px] max-h-[70vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('graveyard.subtitle').slice(0, 24)}…
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">{t('graveyard.title')}</div>
            </div>
            <button
              type="button"
              onClick={() => setGraveyardOpen(false)}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('aria.closeGraveyard')}
            >
              ×
            </button>
          </div>

          <div class="flex-1 overflow-auto px-5 py-4">
            <Show
              when={graveyardBlocks().length > 0}
              fallback={
                <div class="text-sm text-stone-500 italic text-center py-8">
                  {t('graveyard.empty')}
                </div>
              }
            >
              <div class="flex flex-col gap-3">
                <For each={graveyardBlocks()}>
                  {(block) => (
                    <div class="group rounded-lg border border-stone-200 dark:border-stone-700 p-3 hover:border-stone-300 dark:hover:border-stone-600 transition-colors">
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-[10px] text-stone-400 inkmirror-smallcaps">
                          {block.type} · {t('graveyard.deletedFrom', {
                            chapter: block.deleted_from?.chapter_title || '—',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRestore(block.id)}
                          class="text-[11px] text-violet-500 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {t('graveyard.restore')} ↩
                        </button>
                      </div>
                      <div class="font-serif text-sm text-stone-700 dark:text-stone-300 line-clamp-3 whitespace-pre-wrap">
                        {block.content || <span class="italic text-stone-400">(empty)</span>}
                      </div>
                      <Show when={block.deleted_at}>
                        <div class="text-[10px] text-stone-400 mt-1 font-mono">
                          {block.deleted_at}
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
