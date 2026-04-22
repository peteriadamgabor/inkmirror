import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { LANGUAGES, lang, setLang, t } from '@/i18n';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import {
  backfillSentiments,
  detectBackend,
  getAiClient,
  profile,
  resetAiClient,
  runConsistencyScan,
  setStoredProfile,
  type AiBackend,
  type AiProfile,
} from '@/store/ai-facade';
import {
  uiState,
  setSettingsModalOpen,
  setSettingsModalTab,
  type SettingsModalTab,
} from '@/store/ui-state';
import {
  BINDING_META,
  hotkeys,
  setHotkey,
  resetHotkeys,
  comboFromEvent,
  isModifierOnly,
  type AppAction,
} from '@/store/hotkeys';
import {
  BLOCK_KEY_META,
  BLOCK_KEY_SECTION_ORDER,
  type BlockKeySection,
} from './block-keys-meta';

interface SidebarTab {
  id: SettingsModalTab;
  label: string;
}

export const SettingsModal = () => {
  const [backend, setBackend] = createSignal<AiBackend | null>(null);
  const activeTab = () => uiState.settingsModalTab;
  const [clientVersion, setClientVersion] = createSignal(0);
  const [switching, setSwitching] = createSignal(false);
  const [lastError, setLastError] = createSignal<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [capturing, setCapturing] = createSignal<AppAction | null>(null);
  // `closing` stays true for the duration of the exit animation so the
  // backdrop/panel can play their fade-out before the Show unmounts.
  const [closing, setClosing] = createSignal(false);
  let currentFinish: (() => void) | null = null;
  const EXIT_MS = 170;

  function requestClose() {
    if (closing()) return;
    setClosing(true);
    setTimeout(() => {
      setSettingsModalOpen(false);
      setClosing(false);
    }, EXIT_MS);
  }

  // If the modal gets reopened while an exit was pending (shouldn't
  // normally happen, but opening during animation is cheap to guard),
  // drop the closing flag so the panel stays visible.
  createEffect(() => {
    if (uiState.settingsModalOpen && closing()) {
      setClosing(false);
    }
  });

  const client = createMemo(() => {
    clientVersion();
    return getAiClient();
  });

  onMount(async () => {
    setBackend(await detectBackend());
  });

  // Cancel any in-flight hotkey capture when the modal closes.
  createEffect(() => {
    if (!uiState.settingsModalOpen && currentFinish) {
      currentFinish();
    }
  });

  const labelFor = (action: AppAction) => {
    const meta = BINDING_META.find((m) => m.action === action);
    return meta ? t(meta.labelKey as Parameters<typeof t>[0]) : action;
  };

  function startCapture(action: AppAction) {
    currentFinish?.();
    setCapturing(action);
    document.body.dataset.hotkeyCapture = '1';

    const onKey = (e: KeyboardEvent) => {
      if (isModifierOnly(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        finish();
        return;
      }
      const combo = comboFromEvent(e);
      const clash = (Object.entries(hotkeys) as [AppAction, string][]).find(
        ([a, c]) => c === combo && a !== action,
      );
      if (clash) {
        const previousCombo = hotkeys[action];
        setHotkey(clash[0], previousCombo);
        toast.info(t('toast.hotkeySwapped', { label: labelFor(clash[0]) }));
      }
      setHotkey(action, combo);
      finish();
    };

    const finish = () => {
      setCapturing(null);
      delete document.body.dataset.hotkeyCapture;
      window.removeEventListener('keydown', onKey, true);
      currentFinish = null;
    };

    currentFinish = finish;
    window.addEventListener('keydown', onKey, true);
  }

  function onResetHotkeys() {
    resetHotkeys();
    toast.success(t('hotkeys.reset'));
  }

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
    resetAiClient();
    setClientVersion((v) => v + 1);
    try {
      const b = backend() ?? (await detectBackend());
      const c = client();
      await c.configure(next, b, 'q4');
      await c.preload();
      backfillSentiments();
      // First time a user flips to Rich: fire a full consistency sweep
      // once the manuscript has been mood-backfilled. Scheduled via a
      // timeout rather than awaited so the modal can close immediately
      // — the scan shows its progress inside the Consistency panel.
      if (next === 'deep') {
        setTimeout(() => {
          void runConsistencyScan();
        }, 0);
      }
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

  // Tabs are a memo so swapping the language re-renders the labels
  // without re-mounting the modal — `t()` reads `lang()` reactively.
  const tabs = createMemo<SidebarTab[]>(() => [
    { id: 'ai', label: t('settings.tabs.ai') },
    { id: 'hotkeys', label: t('settings.tabs.hotkeys') },
    { id: 'language', label: t('settings.tabs.language') },
  ]);

  // Track focus before the modal opens so we can restore it on close —
  // matches the expected behavior of `aria-modal="true"` dialogs.
  let panelRef: HTMLDivElement | undefined;
  let focusBeforeOpen: HTMLElement | null = null;

  // Escape closes the modal unless the user is mid-hotkey-capture
  // (hotkey capture has its own Escape handler that cancels capture).
  createEffect(() => {
    if (!uiState.settingsModalOpen) return;
    focusBeforeOpen = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (capturing()) return; // capture mode handles Escape itself
      if (closing()) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // Move focus to the panel so screen readers announce the dialog
    // and keyboard users land inside it instead of on <body>.
    queueMicrotask(() => panelRef?.focus());

    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever the user was on before opening.
      const target = focusBeforeOpen;
      focusBeforeOpen = null;
      if (target && typeof target.focus === 'function') {
        queueMicrotask(() => target.focus());
      }
    });
  });

  return (
    <Show when={uiState.settingsModalOpen}>
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm inkmirror-modal-backdrop"
        classList={{ 'inkmirror-modal-backdrop-exit': closing() }}
        onClick={requestClose}
      >
        <div
          ref={panelRef}
          tabindex="-1"
          class="w-[760px] max-w-[92vw] h-[620px] max-h-[86vh] bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel focus:outline-none"
          classList={{ 'inkmirror-modal-panel-exit': closing() }}
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
                {tabs().find((tb) => tb.id === activeTab())?.label}
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>

          <div class="flex-1 flex min-h-0 overflow-hidden">
            <nav class="w-44 shrink-0 border-r border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-1 text-sm overflow-auto">
              <For each={tabs()}>
                {(tab) => (
                  <button
                    type="button"
                    onClick={() => setSettingsModalTab(tab.id)}
                    class="text-left px-3 py-2 rounded-lg transition-colors"
                    classList={{
                      'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 font-semibold':
                        activeTab() === tab.id,
                      'hover:bg-stone-100 dark:hover:bg-stone-700':
                        activeTab() !== tab.id,
                    }}
                  >
                    {tab.label}
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

              <Show when={activeTab() === 'hotkeys'}>
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
                      {t('hotkeys.title')}
                    </h2>
                    <p class="text-sm text-stone-600 dark:text-stone-400">
                      {t('hotkeys.subtitle')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onResetHotkeys}
                    class="text-[11px] text-stone-500 hover:text-violet-500 transition-colors inkmirror-smallcaps shrink-0 ml-4"
                  >
                    {t('hotkeys.reset')}
                  </button>
                </div>
                <div class="flex flex-col gap-0.5">
                  <For each={BINDING_META}>
                    {(meta) => {
                      const isCapturing = () => capturing() === meta.action;
                      return (
                        <div class="flex items-center justify-between gap-4 py-2.5 border-b border-stone-200 dark:border-stone-700 last:border-b-0">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-stone-900 dark:text-stone-50">
                              {t(meta.labelKey as Parameters<typeof t>[0])}
                            </div>
                            <div class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                              {t(meta.descriptionKey as Parameters<typeof t>[0])}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startCapture(meta.action)}
                            class="font-mono text-xs px-3 py-1.5 rounded-lg border-2 transition-colors shrink-0 min-w-[130px] text-center bg-stone-50 dark:bg-stone-900/50"
                            classList={{
                              'border-violet-500 text-violet-500 bg-violet-50 dark:bg-violet-950/30 animate-pulse':
                                isCapturing(),
                              'border-stone-200 dark:border-stone-600 text-stone-800 dark:text-stone-100 hover:border-violet-500 hover:text-violet-500':
                                !isCapturing(),
                            }}
                          >
                            {isCapturing() ? t('hotkeys.pressKey') : hotkeys[meta.action]}
                          </button>
                        </div>
                      );
                    }}
                  </For>
                </div>

                <div class="mt-8">
                  <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
                    {t('hotkeys.blockTitle')}
                  </h2>
                  <p class="text-sm text-stone-600 dark:text-stone-400 mb-3">
                    {t('hotkeys.blockSubtitle')}
                  </p>
                  <For each={BLOCK_KEY_SECTION_ORDER}>
                    {(section: BlockKeySection) => {
                      const rows = BLOCK_KEY_META.filter((k) => k.section === section);
                      return (
                        <div class="mb-4">
                          <div class="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                            {t(`hotkeys.sections.${section}`)}
                          </div>
                          <div class="flex flex-col gap-0.5">
                            <For each={rows}>
                              {(row) => (
                                <div class="flex items-center justify-between gap-4 py-2 border-b border-stone-200 dark:border-stone-700 last:border-b-0">
                                  <div class="flex-1 min-w-0 text-sm text-stone-700 dark:text-stone-200">
                                    {t(row.labelKey)}
                                  </div>
                                  <div class="font-mono text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 shrink-0 min-w-[130px] text-center bg-stone-50 dark:bg-stone-900/50">
                                    {row.combo}
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>

              <Show when={activeTab() === 'language'}>
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
        <span class="font-semibold text-stone-900 dark:text-stone-100">{props.title}</span>
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
