import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { t } from '@/i18n';
import { askConfirm } from '@/ui/shared/confirm';
import {
  detectBackend,
  getStoredProfile,
  setStoredProfile,
  type AiBackend,
  type AiProfile,
} from '@/ai/profile';
import { backfillSentiments, getAiClient, resetAiClient } from '@/ai';
import { uiState, setSettingsModalOpen } from '@/store/ui-state';

type TabId = 'ai' | 'hotkeys' | 'language' | 'export';

interface SidebarTab {
  id: TabId;
  label: string;
  enabled: boolean;
}

export const SettingsModal = () => {
  const [profile, setProfile] = createSignal<AiProfile>(getStoredProfile());
  const [backend, setBackend] = createSignal<AiBackend | null>(null);
  const [activeTab, setActiveTab] = createSignal<TabId>('ai');
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
      backfillSentiments();
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
    <Show when={uiState.settingsModalOpen}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm inkmirror-modal-backdrop"
        onClick={() => setSettingsModalOpen(false)}
      >
        <div
          class="w-[720px] max-w-[92vw] max-h-[80vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('settings.title')}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('settings.title')}
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                {tabs.find((tb) => tb.id === activeTab())?.label}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsModalOpen(false)}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          <div class="flex-1 flex min-h-0 overflow-hidden">
            <nav class="w-44 shrink-0 border-r border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-1 text-sm overflow-auto">
              <For each={tabs}>
                {(tab) => (
                  <button
                    type="button"
                    disabled={!tab.enabled}
                    onClick={() => tab.enabled && setActiveTab(tab.id)}
                    title={tab.enabled ? undefined : t('settings.tabs.comingSoon')}
                    class="text-left px-3 py-2 rounded-lg transition-colors"
                    classList={{
                      'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 font-semibold':
                        activeTab() === tab.id && tab.enabled,
                      'text-stone-400 cursor-not-allowed': !tab.enabled,
                      'hover:bg-stone-100 dark:hover:bg-stone-700':
                        tab.enabled && activeTab() !== tab.id,
                    }}
                  >
                    <span>{tab.label}</span>
                    <Show when={!tab.enabled}>
                      <span class="block mt-0.5 text-[9px] uppercase tracking-wide text-stone-400">
                        {t('settings.tabs.comingSoon')}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </nav>

            <section class="flex-1 overflow-auto p-5 space-y-5">
              <Show when={activeTab() === 'ai'}>
                <div>
                  <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
                    {t('settings.ai.heading')}
                  </h2>
                  <p class="text-sm text-stone-600 dark:text-stone-400">
                    {t('settings.ai.intro')}
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2" data-testid="profile-cards">
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
                      <div class="mb-2 text-stone-700 dark:text-stone-200">
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
          </div>
        </div>
      </div>
    </Show>
  );
};

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
