import { t } from '@/i18n';
import { LanguagePicker } from '@/ui/shared/LanguagePicker';
import { useTheme } from '@/ui/theme';
import { IconSun, IconMoon } from '@/ui/shared/icons';

export const NotFoundRoute = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div class="min-h-screen w-full inkmirror-public-page inkmirror-paper text-stone-900 dark:text-stone-100 flex items-center justify-center px-6 relative">
      <div class="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme() === 'dark' ? t('topBar.switchToLight') : t('topBar.switchToDark')}
          aria-label={t('aria.toggleTheme')}
          class="w-7 h-7 flex items-center justify-center rounded text-stone-600 dark:text-stone-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
        >
          {theme() === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
        </button>
        <LanguagePicker tone="muted" />
      </div>
      <div class="w-[460px] max-w-[92vw] text-center">
        <div class="relative mb-4">
          <div class="font-serif text-[96px] leading-none tracking-tight text-violet-600 dark:text-violet-500">
            404
          </div>
          <div
            class="font-serif text-[96px] leading-none tracking-tight select-none pointer-events-none text-violet-400 dark:text-violet-300 inkmirror-mirror-breath"
            style={{
              'mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 80%)',
              '-webkit-mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 80%)',
              'margin-top': '-4px',
              filter: 'blur(0.5px)',
            }}
            aria-hidden="true"
          >
            404
          </div>
        </div>

        <div class="font-serif text-xl text-stone-800 dark:text-stone-100 mb-2">
          {t('notFound.headline')}
        </div>
        <div class="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
          {t('notFound.body')}
        </div>

        <div class="flex items-center justify-center gap-2 flex-wrap">
          <a
            href="/landing"
            class="px-4 py-2 text-sm rounded-lg border border-stone-300/50 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            {t('notFound.landing')}
          </a>
          <a
            href="/"
            class="px-4 py-2 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
          >
            {t('notFound.open')}
          </a>
        </div>
      </div>
    </div>
  );
};
