import { createMemo, createSignal, onMount, Show, For } from 'solid-js';
import { t } from '@/i18n';
import { askConfirm } from '@/ui/shared/confirm';
import { ConfirmHost } from '@/ui/shared/ConfirmHost';
import { ToastHost } from '@/ui/shared/ToastHost';
import { IconArrowLeft } from '@/ui/shared/icons';
import {
  detectBackend,
  getStoredProfile,
  setStoredProfile,
  type AiBackend,
  type AiProfile,
} from '@/ai/profile';
import { getAiClient, resetAiClient } from '@/ai';

interface SidebarTab {
  id: 'ai' | 'hotkeys' | 'language' | 'export';
  label: string;
  enabled: boolean;
}

export function SettingsRoute() {
  const [profile, setProfile] = createSignal<AiProfile>(getStoredProfile());
  const [backend, setBackend] = createSignal<AiBackend | null>(null);
  const [activeTab, setActiveTab] =
    createSignal<'ai' | 'hotkeys' | 'language' | 'export'>('ai');
  // Incremented whenever we reset the AI client singleton — Solid re-runs
  // the `client` memo so the UI binds to the fresh instance's signals.
  const [clientVersion, setClientVersion] = createSignal(0);
  const [switching, setSwitching] = createSignal(false);
  const [lastError, setLastError] = createSignal<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const client = createMemo(() => {
    clientVersion();
    return getAiClient();
  });

  onMount(async () => {
    setBackend(await detectBackend());
  });

  const modelName = createMemo(() =>
    profile() === 'deep' ? 'mDeBERTa-v3-base' : 'distilbert-multilingual',
  );

  async function chooseProfile(next: AiProfile) {
    if (switching() || next === profile()) return;
    if (next === 'deep') {
      const ok = await askConfirm({
        title: t('settings.ai.download.confirm.title'),
        message: t('settings.ai.download.confirm.body'),
        confirmLabel: t('settings.ai.download.confirm.cta'),
        cancelLabel: t('settings.ai.download.confirm.cancel'),
      });
      if (!ok) return;
    }
    setLastError(null);
    setSwitching(true);
    setStoredProfile(next);
    setProfile(next);
    resetAiClient();
    setClientVersion((v) => v + 1);
    try {
      const b = backend() ?? (await detectBackend());
      const c = client();
      await c.configure(next, b, 'q4');
      await c.preload();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  }

  async function retry() {
    setLastError(null);
    setSwitching(true);
    try {
      const b = backend() ?? (await detectBackend());
      const c = client();
      await c.configure(profile(), b, 'q4');
      await c.preload();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  }

  const tabs: SidebarTab[] = [
    { id: 'ai', label: t('settings.tabs.ai'), enabled: true },
    { id: 'hotkeys', label: t('settings.tabs.hotkeys'), enabled: false },
    { id: 'language', label: t('settings.tabs.language'), enabled: false },
    { id: 'export', label: t('settings.tabs.export'), enabled: false },
  ];

  return (
    <div class="min-h-screen bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100">
      <header class="max-w-5xl mx-auto px-6 py-6 flex items-center gap-4">
        <a
          href="/"
          class="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-violet-500 transition-colors"
        >
          <IconArrowLeft size={16} />
          <span>{t('settings.back')}</span>
        </a>
        <h1 class="text-xl font-semibold ml-auto">{t('settings.title')}</h1>
      </header>

      <main class="max-w-5xl mx-auto px-6 pb-16 grid gap-6 md:grid-cols-[200px_1fr]">
        <nav class="flex flex-col gap-1 text-sm">
          <For each={tabs}>
            {(tab) => (
              <button
                type="button"
                disabled={!tab.enabled}
                onClick={() => tab.enabled && setActiveTab(tab.id)}
                title={tab.enabled ? undefined : t('settings.tabs.comingSoon')}
                class="text-left px-3 py-2 rounded-lg transition-colors"
                classList={{
                  'bg-white dark:bg-stone-800 font-semibold': activeTab() === tab.id,
                  'text-stone-400 cursor-not-allowed': !tab.enabled,
                  'hover:bg-stone-200 dark:hover:bg-stone-800':
                    tab.enabled && activeTab() !== tab.id,
                }}
              >
                {tab.label}
                <Show when={!tab.enabled}>
                  <span class="ml-2 text-[10px] uppercase tracking-wide text-stone-400">
                    {t('settings.tabs.comingSoon')}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </nav>

        <section class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 md:p-8 space-y-6">
          <Show when={activeTab() === 'ai'}>
            <div>
              <h2 class="text-lg font-semibold mb-1">{t('settings.ai.heading')}</h2>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                {t('settings.ai.intro')}
              </p>
            </div>

            <div class="grid gap-3 md:grid-cols-2" data-testid="profile-cards">
              <ProfileCard
                name="basic"
                title={t('settings.ai.profile.basic.title')}
                description={t('settings.ai.profile.basic.description')}
                active={profile() === 'lightweight'}
                disabled={switching()}
                switchLabel={t('settings.ai.profile.switchTo', {
                  name: t('settings.ai.profile.basic.title'),
                })}
                activeLabel={t('settings.ai.profile.active')}
                onSelect={() => chooseProfile('lightweight')}
              />
              <ProfileCard
                name="rich"
                title={t('settings.ai.profile.rich.title')}
                description={t('settings.ai.profile.rich.description')}
                active={profile() === 'deep'}
                disabled={switching()}
                switchLabel={t('settings.ai.profile.switchTo', {
                  name: t('settings.ai.profile.rich.title'),
                })}
                activeLabel={t('settings.ai.profile.active')}
                onSelect={() => chooseProfile('deep')}
              />
            </div>

            <Show when={client().modelProgress()}>
              {(progress) => (
                <div
                  class="rounded-lg bg-stone-100 dark:bg-stone-900 p-4 text-sm"
                  data-testid="download-progress"
                >
                  <div class="mb-2">
                    {progress().percent !== null
                      ? t('settings.ai.download.progress', {
                          phase: progress().phase,
                          percent: String(Math.round(progress().percent ?? 0)),
                        })
                      : t('settings.ai.download.progressNoPercent', {
                          phase: progress().phase,
                        })}
                  </div>
                  <div class="h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-violet-500 transition-[width] duration-150"
                      style={{
                        width:
                          progress().percent !== null
                            ? `${Math.max(0, Math.min(100, progress().percent ?? 0))}%`
                            : '30%',
                      }}
                    />
                  </div>
                </div>
              )}
            </Show>

            <Show when={lastError()}>
              {(msg) => (
                <div
                  class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300"
                  role="alert"
                  data-testid="load-error"
                >
                  <p class="mb-2">
                    {t('settings.ai.download.failed', { error: msg() })}
                  </p>
                  <button
                    type="button"
                    class="underline hover:text-red-900 dark:hover:text-red-100"
                    onClick={retry}
                  >
                    {t('settings.ai.download.retry')}
                  </button>
                </div>
              )}
            </Show>

            <div class="text-xs text-stone-500 dark:text-stone-400 space-y-1 font-mono">
              <div>{t('settings.ai.status.model', { name: modelName() })}</div>
              <div>
                <Show
                  when={backend() === 'webgpu'}
                  fallback={t('settings.ai.status.accelerationWasm')}
                >
                  {t('settings.ai.status.accelerationWebgpu')}
                </Show>
              </div>
              <div>{t('settings.ai.status.languages')}</div>
            </div>

            <p class="text-xs text-stone-500 dark:text-stone-400 italic">
              {t('settings.ai.privacy')}
            </p>

            <Show when={profile() === 'deep'}>
              <div class="border-t border-stone-200 dark:border-stone-700 pt-4">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  class="text-sm text-stone-600 dark:text-stone-400 hover:text-violet-500"
                >
                  {advancedOpen()
                    ? t('settings.ai.advanced.collapse')
                    : t('settings.ai.advanced.expand')}
                </button>
                <Show when={advancedOpen()}>
                  <div class="mt-4 rounded-lg bg-stone-100 dark:bg-stone-900 p-4">
                    <h3 class="font-semibold mb-1 text-sm">
                      {t('settings.ai.revert.title')}
                    </h3>
                    <p class="text-xs text-stone-600 dark:text-stone-400 mb-3">
                      {t('settings.ai.revert.description')}
                    </p>
                    <button
                      type="button"
                      disabled={switching()}
                      onClick={() => chooseProfile('lightweight')}
                      class="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
                    >
                      {t('settings.ai.revert.cta')}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </section>
      </main>

      <ConfirmHost />
      <ToastHost />
    </div>
  );
}

interface ProfileCardProps {
  name: string;
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  switchLabel: string;
  activeLabel: string;
  onSelect: () => void;
}

function ProfileCard(props: ProfileCardProps) {
  return (
    <button
      type="button"
      disabled={props.disabled || props.active}
      onClick={props.onSelect}
      data-profile={props.name}
      class="text-left rounded-2xl border p-4 transition-colors"
      classList={{
        'border-violet-500 bg-violet-50 dark:bg-violet-900/20': props.active,
        'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700':
          !props.active,
        'cursor-not-allowed opacity-60': props.disabled && !props.active,
      }}
    >
      <div class="flex items-baseline justify-between mb-1">
        <span class="font-semibold">{props.title}</span>
        <Show
          when={props.active}
          fallback={
            <span class="text-xs text-violet-500 font-medium">{props.switchLabel}</span>
          }
        >
          <span class="text-xs uppercase tracking-wide text-violet-500 font-semibold">
            {props.activeLabel}
          </span>
        </Show>
      </div>
      <p class="text-sm text-stone-600 dark:text-stone-400">{props.description}</p>
    </button>
  );
}
