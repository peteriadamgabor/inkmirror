import { createResource, createSignal, For, Show } from 'solid-js';
import { t } from '@/i18n';
import {
  estimate,
  formatBytes,
  isPersisted,
  requestPersistence,
} from '@/utils/storage';
import { toast } from '@/ui/shared/toast';
import {
  REVISION_PRESETS,
  revisionPreset,
  setRevisionPreset,
  type RevisionPreset,
} from '@/store/revision-preset';

export function SettingsAdvancedTab() {
  // Two reactive resources, refetchable so the "Request again" CTA can
  // re-read both numbers without a full tab remount.
  const [storage, { refetch: refetchStorage }] = createResource(estimate);
  const [persisted, { refetch: refetchPersisted }] = createResource(isPersisted);
  const [asking, setAsking] = createSignal(false);

  async function onRequestPersist() {
    if (asking()) return;
    setAsking(true);
    try {
      const granted = await requestPersistence();
      // Re-read both: persist() may also indirectly affect quota in some
      // browsers, and the badge needs to reflect the new state.
      await refetchPersisted();
      await refetchStorage();
      if (granted) {
        toast.success(t('settings.advanced.persistGranted'));
      } else {
        toast.info(t('settings.advanced.persistDenied'));
      }
    } finally {
      setAsking(false);
    }
  }

  return (
    <div class="flex flex-col gap-6">
      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.advanced.storage.heading')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3">
          {t('settings.advanced.storage.body')}
        </p>

        <Show
          when={storage()}
          fallback={
            <Show
              when={!storage.loading}
              fallback={
                <div class="text-sm text-stone-400 dark:text-stone-500">
                  {t('common.loading')}
                </div>
              }
            >
              <div class="text-sm text-stone-500 dark:text-stone-400">
                {t('settings.advanced.storage.unsupported')}
              </div>
            </Show>
          }
        >
          {(s) => (
            <div class="flex flex-col gap-2">
              <div class="text-sm text-stone-700 dark:text-stone-200 tabular-nums">
                <Show
                  when={s().fraction !== null}
                  fallback={
                    <span>
                      {t('settings.advanced.storage.usageNoQuota', {
                        used: formatBytes(s().usedBytes),
                      })}
                    </span>
                  }
                >
                  <span>
                    {t('settings.advanced.storage.usage', {
                      used: formatBytes(s().usedBytes),
                      quota: formatBytes(s().quotaBytes),
                      percent: Math.round((s().fraction ?? 0) * 100).toString(),
                    })}
                  </span>
                </Show>
              </div>
              <Show when={s().fraction !== null}>
                <div class="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-violet-500 transition-all"
                    style={{ width: `${Math.round((s().fraction ?? 0) * 100)}%` }}
                  />
                </div>
              </Show>
            </div>
          )}
        </Show>
      </section>

      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.advanced.persist.heading')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3">
          {t('settings.advanced.persist.body')}
        </p>

        <Show
          when={!persisted.loading}
          fallback={
            <div class="text-sm text-stone-400 dark:text-stone-500">
              {t('common.loading')}
            </div>
          }
        >
          <Show
            when={persisted()}
            fallback={
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                  <span class="w-2 h-2 rounded-full bg-orange-500" />
                  {t('settings.advanced.persist.statusOff')}
                </span>
                <button
                  type="button"
                  disabled={asking()}
                  onClick={() => void onRequestPersist()}
                  class="px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-violet-300 dark:hover:border-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {asking() ? t('common.loading') : t('settings.advanced.persist.requestAgain')}
                </button>
              </div>
            }
          >
            <span class="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <span class="w-2 h-2 rounded-full bg-emerald-500" />
              {t('settings.advanced.persist.statusOn')}
            </span>
          </Show>
        </Show>
      </section>

      <section>
        <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
          {t('settings.advanced.revisionHistory.heading')}
        </h2>
        <p class="text-sm text-stone-600 dark:text-stone-400 mb-3">
          {t('settings.advanced.revisionHistory.body')}
        </p>
        <div class="flex flex-col gap-1">
          <For each={REVISION_PRESETS}>
            {(p: RevisionPreset) => (
              <label class="group flex items-center gap-3 py-1 cursor-pointer select-none">
                <input
                  type="radio"
                  name="inkmirror-revision-preset"
                  value={p}
                  checked={revisionPreset() === p}
                  onChange={() => setRevisionPreset(p)}
                  class="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  class="relative w-4 h-4 shrink-0 rounded-full border border-stone-300 dark:border-stone-600 transition-colors group-hover:border-stone-400 dark:group-hover:border-stone-500 peer-checked:border-violet-500 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-300 dark:peer-focus-visible:ring-violet-700 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-stone-800 after:content-[''] after:absolute after:inset-[3px] after:rounded-full after:bg-violet-500 after:scale-0 motion-safe:after:transition-transform peer-checked:after:scale-100"
                />
                <span class="text-sm text-stone-700 dark:text-stone-200 motion-safe:transition-colors peer-checked:text-stone-900 dark:peer-checked:text-stone-50">
                  {t(`settings.advanced.revisionHistory.${p}` as const)}
                </span>
              </label>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
