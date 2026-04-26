import { createEffect, Show } from 'solid-js';
import { uiState, setSearchOpen } from '@/store/ui-state';
import { t } from '@/i18n';
import { IconChevron, IconClose, IconSearch } from '@/ui/shared/icons';
import { useReplace, useSearch } from './editor-search-state';

export const EditorSearch = () => {
  const search = useSearch();
  const replace = useReplace(search);
  let inputEl: HTMLInputElement | undefined;

  // Reset state and focus input each time the bar opens.
  createEffect(() => {
    if (uiState.searchOpen) {
      search.reset();
      replace.setReplacement('');
      queueMicrotask(() => inputEl?.focus());
    }
  });

  const close = () => setSearchOpen(false);

  const onSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) search.prev();
      else search.next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      search.next();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      search.prev();
    }
  };

  const onReplaceKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) replace.replaceAll();
      else replace.replaceCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <Show when={uiState.searchOpen}>
      <div
        class="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-[560px] max-w-[92vw] flex flex-col gap-2 px-3 py-2 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl"
        data-search-bar
      >
        <div class="flex items-center gap-2">
          <IconSearch size={14} class="text-stone-400 shrink-0" />
          <input
            ref={inputEl}
            type="text"
            value={search.query()}
            onInput={(e) => {
              search.setQuery(e.currentTarget.value);
              search.setCursor(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t('search.placeholder')}
            class="flex-1 min-w-0 bg-transparent outline-none text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400"
            aria-label={t('search.placeholder')}
          />
          <span
            class="text-[10px] tabular-nums text-stone-500 shrink-0 min-w-[3.5rem] text-right"
            data-testid="search-counter"
          >
            {search.counterText()}
          </span>
          <button
            type="button"
            onClick={search.prev}
            disabled={search.hits().length === 0}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 disabled:opacity-30 transition-colors"
            title={t('search.prev')}
            aria-label={t('search.prev')}
          >
            <IconChevron size={12} class="rotate-180" />
          </button>
          <button
            type="button"
            onClick={search.next}
            disabled={search.hits().length === 0}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 disabled:opacity-30 transition-colors"
            title={t('search.next')}
            aria-label={t('search.next')}
          >
            <IconChevron size={12} />
          </button>
          <button
            type="button"
            onClick={close}
            class="w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-violet-500 transition-colors"
            title={t('search.close')}
            aria-label={t('search.close')}
          >
            <IconClose size={12} />
          </button>
        </div>
        <div class="flex items-center gap-2 pl-[22px]">
          <input
            type="text"
            value={replace.replacement()}
            onInput={(e) => replace.setReplacement(e.currentTarget.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder={t('search.replacePlaceholder')}
            class="flex-1 min-w-0 bg-transparent outline-none text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 border-b border-stone-200/60 dark:border-stone-700/40 focus:border-violet-400"
            aria-label={t('search.replacePlaceholder')}
            data-testid="search-replace-input"
          />
          <button
            type="button"
            onClick={replace.replaceCurrent}
            disabled={search.hits().length === 0}
            class="text-[11px] px-2 py-0.5 rounded text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors"
            title={t('search.replaceTitle')}
            data-testid="search-replace-one"
          >
            {t('search.replace')}
          </button>
          <button
            type="button"
            onClick={replace.replaceAll}
            disabled={search.hits().length === 0}
            class="text-[11px] px-2 py-0.5 rounded text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-stone-700 disabled:opacity-30 transition-colors"
            title={t('search.replaceAllTitle')}
            data-testid="search-replace-all"
          >
            {t('search.replaceAll')}
          </button>
        </div>
      </div>
    </Show>
  );
};
