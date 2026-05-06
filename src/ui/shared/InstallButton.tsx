import { Show } from 'solid-js';
import { installPromptAvailable, triggerInstall } from './pwa-install';
import { toast } from './toast';
import { IconInstall } from './icons';
import { t } from '@/i18n';

/**
 * Install affordance for the public surface. Renders only when the
 * browser has fired `beforeinstallprompt` and the app is not already
 * running in standalone mode. Self-hides on the vast majority of
 * visits — Firefox / iOS Safari / already-installed users never see it.
 */
export const InstallButton = () => {
  const onClick = async () => {
    const result = await triggerInstall();
    if (result === 'accepted') {
      toast.success(t('pwa.installed'));
    }
  };
  return (
    <Show when={installPromptAvailable()}>
      <button
        type="button"
        onClick={onClick}
        title={t('pwa.install')}
        aria-label={t('pwa.install')}
        class="w-7 h-7 flex items-center justify-center rounded text-stone-600 dark:text-stone-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
      >
        <IconInstall size={14} />
      </button>
    </Show>
  );
};
