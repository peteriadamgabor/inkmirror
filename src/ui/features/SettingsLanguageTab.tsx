import { For } from 'solid-js';
import { LANGUAGES, lang, setLang, t } from '@/i18n';

export const SettingsLanguageTab = () => (
  <>
    <div>
      <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
        {t('language.label')}
      </h2>
      <p class="text-sm text-stone-600 dark:text-stone-400">
        {t('language.help')}
      </p>
    </div>
    <div class="flex flex-wrap gap-2" data-testid="language-choices">
      <For each={LANGUAGES}>
        {(l) => {
          const active = () => lang() === l.code;
          return (
            <button
              type="button"
              data-lang={l.code}
              onClick={() => setLang(l.code)}
              class="px-4 py-2 text-sm rounded-lg border transition-colors"
              classList={{
                'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-200 font-semibold':
                  active(),
                'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-violet-300':
                  !active(),
              }}
            >
              {l.label}
            </button>
          );
        }}
      </For>
    </div>
  </>
);
