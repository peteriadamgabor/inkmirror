import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { LANGUAGES, lang, setLang, t } from '@/i18n';

interface Props {
  /** 'compact' (default) = small icon-button opening a popover. 'inline' = buttons side-by-side, no popover. */
  variant?: 'compact' | 'inline';
  /** Visual tone — picker should adapt to its surface (landing dark hero vs. light card). */
  tone?: 'default' | 'muted' | 'onDark';
  class?: string;
}

export const LanguagePicker = (props: Props) => {
  const variant = () => props.variant ?? 'compact';
  const [open, setOpen] = createSignal(false);
  let rootEl!: HTMLDivElement;

  const currentLabel = () =>
    LANGUAGES.find((l) => l.code === lang())?.label ?? lang().toUpperCase();

  const onDocClick = (e: MouseEvent) => {
    if (!rootEl.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) setOpen(false);
  };
  onMount(() => {
    window.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('keydown', onKey);
  });
  onCleanup(() => {
    window.removeEventListener('mousedown', onDocClick, true);
    window.removeEventListener('keydown', onKey);
  });

  const buttonToneClass = () => {
    switch (props.tone) {
      case 'onDark':
        return 'border-stone-700 text-stone-300 hover:text-white hover:border-stone-500';
      case 'muted':
        return 'border-stone-200 dark:border-stone-700 text-stone-400 hover:text-violet-500 hover:border-violet-500';
      default:
        return 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:border-violet-500';
    }
  };

  if (variant() === 'inline') {
    return (
      <div class={`flex items-center gap-1.5 ${props.class ?? ''}`}>
        {LANGUAGES.map((l) => {
          const active = () => lang() === l.code;
          return (
            <button
              type="button"
              onClick={() => setLang(l.code)}
              class="px-2.5 py-1 text-[11px] rounded-lg border transition-colors"
              classList={{
                'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-200':
                  active(),
                [buttonToneClass()]: !active(),
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootEl} class={`relative ${props.class ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class={`px-3 py-1 text-[11px] rounded-lg border transition-colors ${buttonToneClass()}`}
        title={t('language.label')}
        aria-haspopup="listbox"
        aria-expanded={open()}
      >
        {currentLabel()}
      </button>
      <Show when={open()}>
        <div
          class="absolute right-0 top-full mt-1.5 min-w-[140px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-lg overflow-hidden z-50"
          role="listbox"
        >
          {LANGUAGES.map((l) => {
            const active = () => lang() === l.code;
            return (
              <button
                type="button"
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active()}
                class="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-between gap-2 transition-colors"
                classList={{
                  'text-violet-700 dark:text-violet-200 bg-violet-50/50 dark:bg-violet-900/20':
                    active(),
                  'text-stone-700 dark:text-stone-200': !active(),
                }}
              >
                <span>{l.label}</span>
                <Show when={active()}>
                  <span class="text-[10px] text-violet-500">●</span>
                </Show>
              </button>
            );
          })}
        </div>
      </Show>
    </div>
  );
};
