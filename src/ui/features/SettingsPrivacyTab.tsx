import { createSignal, For } from 'solid-js';
import { t } from '@/i18n';
import {
  isErrorReportingEnabled,
  setErrorReportingEnabled,
} from '@/utils/glitchtip';

/**
 * Settings → Privacy tab. Plain-language summary, sub-processor list,
 * and the opt-in switchboard for any feature that sends data beyond
 * the browser. Everything here is off by default.
 */
export function SettingsPrivacyTab() {
  const [errorReports, setErrorReports] = createSignal(isErrorReportingEnabled());
  const [reloadHintShown, setReloadHintShown] = createSignal(false);

  function onToggleErrorReports() {
    const next = !errorReports();
    setErrorReports(next);
    setErrorReportingEnabled(next);
    // The Sentry SDK is initialised once at boot. A flip after boot
    // takes effect on next reload, so we surface a hint instead of
    // pretending it's instant.
    setReloadHintShown(true);
  }

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
              {
                name: t('settings.privacy.subprocessors.glitchtip.name'),
                role: t('settings.privacy.subprocessors.glitchtip.role'),
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

        <div class="flex flex-col gap-2 py-2 px-3 rounded-lg border border-stone-100 dark:border-stone-700">
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-col">
              <span class="font-medium text-stone-800 dark:text-stone-100 text-sm">
                {t('settings.privacy.errorReports.title')}
              </span>
              <span class="text-stone-500 dark:text-stone-400 text-xs leading-relaxed mt-0.5">
                {t('settings.privacy.errorReports.body')}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={errorReports()}
              onClick={onToggleErrorReports}
              class={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                errorReports()
                  ? 'bg-violet-500'
                  : 'bg-stone-200 dark:bg-stone-700'
              }`}
            >
              <span
                class={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                  errorReports() ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {reloadHintShown() && (
            <p class="text-xs text-stone-500 dark:text-stone-400 italic">
              {t('settings.privacy.errorReports.reloadHint')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
