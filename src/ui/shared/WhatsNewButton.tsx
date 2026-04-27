import { Show } from 'solid-js';
import { t } from '@/i18n';
import { IconSparkles } from '@/ui/shared/icons';
import { hasUnreadWhatsNew, openWhatsNew } from '@/store/whats-new';

interface Props {
  /**
   * Match the surrounding chrome. `muted` is the editor top-bar tone
   * (low-contrast neutral, hover violet); `default` is the picker
   * header (slightly stronger neutral). Mirrors LanguagePicker's
   * vocabulary so the two controls feel like siblings.
   */
  tone?: 'default' | 'muted';
  class?: string;
}

export const WhatsNewButton = (props: Props) => {
  const toneClass = () =>
    props.tone === 'muted'
      ? 'border-stone-200 dark:border-stone-700 text-stone-400 hover:text-violet-500 hover:border-violet-500'
      : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:border-violet-500';

  return (
    <button
      type="button"
      onClick={openWhatsNew}
      class={`relative px-2.5 py-1 rounded-lg border transition-colors flex items-center justify-center ${toneClass()} ${props.class ?? ''}`}
      title={t('whatsNew.triggerTitle')}
      aria-label={t('whatsNew.triggerTitle')}
    >
      <IconSparkles size={14} />
      <Show when={hasUnreadWhatsNew()}>
        <span
          class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-500 ring-2 ring-white dark:ring-stone-800"
          aria-label={t('whatsNew.badgeAria')}
        />
      </Show>
    </button>
  );
};
