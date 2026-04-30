import { For } from 'solid-js';
import { t } from '@/i18n';

/**
 * Settings → Privacy tab. Structural slot opened ahead of opt-in
 * features (GlitchTip error reporting, announcements off-switch if we
 * ever offer one, future telemetry) so each future toggle has a clean
 * home and isn't squatting in another tab. The full privacy disclosure
 * lives at `/privacy`; this is the in-app summary + opt-in switchboard.
 */
export function SettingsPrivacyTab() {
  return (
    <div class="flex flex-col gap-6">
      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.privacy.summary.heading')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3 leading-relaxed">
          {t('settings.privacy.summary.body')}
        </p>
        <ul class="text-sm text-stone-600 dark:text-stone-400 mb-3 list-disc list-inside space-y-1 leading-relaxed">
          <For
            each={[
              t('settings.privacy.summary.bullet1'),
              t('settings.privacy.summary.bullet2'),
              t('settings.privacy.summary.bullet3'),
            ]}
          >
            {(item) => <li>{item}</li>}
          </For>
        </ul>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener"
          class="text-sm text-violet-600 dark:text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-500"
        >
          {t('settings.privacy.summary.fullLink')}
        </a>
      </section>

      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.privacy.subprocessors.heading')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3 leading-relaxed">
          {t('settings.privacy.subprocessors.body')}
        </p>
        <ul class="flex flex-col gap-2 text-sm">
          <For
            each={[
              {
                name: t('settings.privacy.subprocessors.cloudflare.name'),
                role: t('settings.privacy.subprocessors.cloudflare.role'),
              },
              {
                name: t('settings.privacy.subprocessors.huggingface.name'),
                role: t('settings.privacy.subprocessors.huggingface.role'),
              },
              {
                name: t('settings.privacy.subprocessors.discord.name'),
                role: t('settings.privacy.subprocessors.discord.role'),
              },
            ]}
          >
            {(sp) => (
              <li class="flex flex-col py-2 px-3 rounded-lg border border-stone-100 dark:border-stone-700">
                <span class="font-medium text-stone-800 dark:text-stone-100">
                  {sp.name}
                </span>
                <span class="text-stone-500 dark:text-stone-400 text-xs leading-relaxed">
                  {sp.role}
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.privacy.optIns.heading')}
        </h2>
        <p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
          {t('settings.privacy.optIns.empty')}
        </p>
      </section>
    </div>
  );
}
