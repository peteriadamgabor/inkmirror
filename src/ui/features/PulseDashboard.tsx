import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import {
  getLastPulseMetrics,
  requestPulseSnapshot,
  resetPulse,
  type PulseMetrics,
} from '@/workers/pulse-client';
import { t } from '@/i18n';

const POLL_MS = 1500;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export const PulseDashboard = () => {
  const [metrics, setMetrics] = createSignal<PulseMetrics | null>(null);
  const [now, setNow] = createSignal(Date.now());
  let interval: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    requestPulseSnapshot();
    // Snapshot reply is async but arrives on next microtask in the worker path.
    setTimeout(() => {
      const m = getLastPulseMetrics();
      if (m) setMetrics(m);
      setNow(Date.now());
    }, 50);
  };

  onMount(() => {
    tick();
    interval = setInterval(tick, POLL_MS);
  });
  onCleanup(() => {
    if (interval) clearInterval(interval);
  });

  const sessionMs = () => {
    const m = metrics();
    return m ? now() - m.sessionStartedAt : 0;
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
          {t('pulse.title')}
        </div>
        <button
          type="button"
          onClick={() => {
            resetPulse();
            setMetrics(null);
          }}
          class="text-[10px] text-stone-400 hover:text-violet-500 transition-colors"
          title={t('misc.resetSession')}
        >
          reset
        </button>
      </div>
      <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
        <Show
          when={(() => {
            const m = metrics();
            return m && m.totalKeys > 0 ? m : null;
          })()}
          fallback={
            <div class="text-xs text-stone-400">—</div>
          }
        >
          {(m) => (
            <div class="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stat label="WPM" value={Math.round(m().wpm).toString()} />
              <Stat label="burst/s" value={m().burstRate.toFixed(1)} />
              <Stat label="keys" value={m().totalKeys.toString()} />
              <Stat label="session" value={formatDuration(sessionMs())} />
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

const Stat = (props: { label: string; value: string }) => (
  <div>
    <div class="text-[10px] text-stone-400 inkmirror-smallcaps">{props.label}</div>
    <div class="font-mono text-lg text-stone-800 dark:text-stone-100 leading-tight">
      {props.value}
    </div>
  </div>
);
