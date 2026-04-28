import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { t } from '@/i18n';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import {
  DEFAULT_THRESHOLD,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  getContradictionThreshold,
  isThresholdOverridden,
  resetContradictionThreshold,
  setContradictionThreshold,
} from '@/ai/dev-threshold';
import { runInstrumentedScan, type InstrumentedScanResult } from '@/ai/dev-instrumentation';
import { disableDevMode } from '@/ui/shared/dev-mode';
import { isScanRunning } from '@/ai/inconsistency';
import type { PairScoreData } from '@/ai/inconsistency';
import type { TriggerCategory } from '@/types';

const EXIT_MS = 170;
const NEAR_MISS_FLOOR = 0.3;
const HISTOGRAM_BIN_WIDTH = 0.05;
const SENTENCE_TRUNCATE = 80;

const [devMenuOpen, setDevMenuOpenInternal] = createSignal(false);
export function openDevMenu(): void {
  setDevMenuOpenInternal(true);
}
export function closeDevMenu(): void {
  setDevMenuOpenInternal(false);
}
export function isDevMenuOpen(): boolean {
  return devMenuOpen();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function formatScore(n: number): string {
  return n.toFixed(2);
}

function formatMs(n: number): string {
  if (n < 10) return n.toFixed(1) + 'ms';
  return Math.round(n).toString() + 'ms';
}

interface HistogramBin {
  start: number;
  end: number;
  count: number;
  pairs: PairScoreData[];
}

function buildHistogram(pairs: readonly PairScoreData[]): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let s = 0; s < 1; s += HISTOGRAM_BIN_WIDTH) {
    bins.push({ start: s, end: s + HISTOGRAM_BIN_WIDTH, count: 0, pairs: [] });
  }
  for (const p of pairs) {
    const score = Math.min(0.9999, Math.max(0, p.maxContradiction));
    const idx = Math.floor(score / HISTOGRAM_BIN_WIDTH);
    bins[idx].count++;
    bins[idx].pairs.push(p);
  }
  return bins;
}

interface CategoryCount {
  category: TriggerCategory;
  count: number;
}

function buildCategoryCounts(pairs: readonly PairScoreData[]): CategoryCount[] {
  const tally = new Map<TriggerCategory, number>();
  for (const p of pairs) {
    for (const c of p.sharedCategories) tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

const DevMenu = () => {
  const [closing, setClosing] = createSignal(false);
  const [result, setResult] = createSignal<InstrumentedScanResult | null>(null);
  const [running, setRunning] = createSignal(false);
  const [scanError, setScanError] = createSignal<string | null>(null);
  const [highlightBin, setHighlightBin] = createSignal<{ start: number; end: number } | null>(null);
  const [expandedPair, setExpandedPair] = createSignal<string | null>(null);

  function pairKey(p: PairScoreData): string {
    return `${p.blockA.id}:${p.blockA.sentenceIdx}|${p.blockB.id}:${p.blockB.sentenceIdx}`;
  }

  function requestClose() {
    if (closing()) return;
    setClosing(true);
    setTimeout(() => {
      closeDevMenu();
      setClosing(false);
    }, EXIT_MS);
  }

  createEffect(() => {
    if (devMenuOpen() && closing()) setClosing(false);
  });

  createEffect(() => {
    if (!devMenuOpen()) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (closing()) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  // Live partition: re-derive above-threshold and near-misses
  // whenever the slider moves, without re-running the scan.
  const liveThreshold = createMemo(() => getContradictionThreshold());
  const visiblePairs = createMemo(() => {
    const r = result();
    if (!r) return [] as PairScoreData[];
    const bin = highlightBin();
    if (!bin) return r.pairs;
    return r.pairs.filter((p) => p.maxContradiction >= bin.start && p.maxContradiction < bin.end);
  });

  const aboveThreshold = createMemo(() => {
    const th = liveThreshold();
    return visiblePairs()
      .filter((p) => p.maxContradiction >= th)
      .slice()
      .sort((a, b) => b.maxContradiction - a.maxContradiction);
  });

  const nearMisses = createMemo(() => {
    const th = liveThreshold();
    return visiblePairs()
      .filter((p) => p.maxContradiction >= NEAR_MISS_FLOOR && p.maxContradiction < th)
      .slice()
      .sort((a, b) => b.maxContradiction - a.maxContradiction);
  });

  const histogram = createMemo(() => buildHistogram(result()?.pairs ?? []));
  const histogramMax = createMemo(() => histogram().reduce((m, b) => Math.max(m, b.count), 0));
  const categories = createMemo(() => buildCategoryCounts(result()?.pairs ?? []));
  const categoryMax = createMemo(() => categories().reduce((m, c) => Math.max(m, c.count), 0));

  async function onRunScan() {
    if (running() || isScanRunning()) return;
    setRunning(true);
    setScanError(null);
    setHighlightBin(null);
    setExpandedPair(null);
    try {
      const r = await runInstrumentedScan();
      setResult(r);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function onSliderInput(e: Event) {
    const value = Number.parseFloat((e.currentTarget as HTMLInputElement).value);
    setContradictionThreshold(value);
  }

  function onResetThreshold() {
    resetContradictionThreshold();
  }

  function onDisableDevMode() {
    disableDevMode();
    requestClose();
  }

  function toggleHighlight(bin: HistogramBin) {
    const cur = highlightBin();
    if (cur && cur.start === bin.start) setHighlightBin(null);
    else setHighlightBin({ start: bin.start, end: bin.end });
  }

  return (
    <Show when={devMenuOpen()}>
      <ModalBackdrop closing={closing()} onClick={requestClose}>
        <div
          class="w-[860px] max-w-[94vw] h-[680px] max-h-[88vh] bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel focus:outline-none"
          classList={{ 'inkmirror-modal-panel-exit': closing() }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('dev.menu.title')}
        >
          <header class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
                {t('dev.menu.title')}
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                {t('dev.menu.subtitle')}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={onDisableDevMode}
                class="text-[10px] text-stone-400 hover:text-rose-500 transition-colors"
                title={t('dev.menu.disableHint')}
              >
                {t('dev.menu.disableDevMode')}
              </button>
              <button
                type="button"
                onClick={requestClose}
                class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                aria-label="close"
              >
                ×
              </button>
            </div>
          </header>

          <section class="px-5 py-3 border-b border-stone-200 dark:border-stone-700 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
              <label class="flex-1 flex items-center gap-3">
                <span class="text-[11px] text-stone-500 dark:text-stone-400 inkmirror-smallcaps shrink-0">
                  {t('dev.menu.threshold')}
                </span>
                <input
                  type="range"
                  min={MIN_THRESHOLD}
                  max={MAX_THRESHOLD}
                  step={0.01}
                  value={liveThreshold()}
                  onInput={onSliderInput}
                  class="flex-1 accent-violet-500"
                  aria-label={t('dev.menu.threshold')}
                />
                <span class="font-mono text-sm tabular-nums w-12 text-right">
                  {liveThreshold().toFixed(2)}
                </span>
              </label>
              <Show when={isThresholdOverridden()}>
                <button
                  type="button"
                  onClick={onResetThreshold}
                  class="text-[10px] text-stone-400 hover:text-violet-500 transition-colors inkmirror-smallcaps"
                >
                  {t('dev.menu.resetThreshold')}
                </button>
              </Show>
              <button
                type="button"
                onClick={onRunScan}
                disabled={running() || isScanRunning()}
                class="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-700 transition-colors"
              >
                {running() ? t('dev.menu.rescanning') : t('dev.menu.runScan')}
              </button>
            </div>
            <div class="text-[10px] text-stone-400">
              {t('dev.menu.thresholdHint', { value: DEFAULT_THRESHOLD.toFixed(2) })}
            </div>
            <Show when={scanError()}>
              <div class="text-[10px] text-rose-500" role="alert">{scanError()}</div>
            </Show>
          </section>

          <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
            <Show
              when={result()}
              fallback={
                <div class="flex-1 flex items-center justify-center text-sm text-stone-400">
                  {t('dev.menu.empty')}
                </div>
              }
            >
              {(r) => (
                <>
                  {/* Histogram */}
                  <section class="flex flex-col gap-2">
                    <div class="flex items-baseline justify-between">
                      <h3 class="text-[10px] inkmirror-smallcaps text-stone-500 dark:text-stone-400 font-medium">
                        {t('dev.menu.histogram')}
                      </h3>
                      <span class="text-[10px] text-stone-400">{t('dev.menu.histogramHint')}</span>
                    </div>
                    <div class="rounded-lg border border-stone-200 dark:border-stone-700 p-3">
                      <div class="flex items-end gap-1 h-24" role="img" aria-label={t('dev.menu.histogram')}>
                        <For each={histogram()}>
                          {(bin) => {
                            const pct = () => (histogramMax() > 0 ? (bin.count / histogramMax()) * 100 : 0);
                            const inThreshold = () => bin.start >= liveThreshold();
                            const highlighted = () => {
                              const h = highlightBin();
                              return h !== null && h.start === bin.start;
                            };
                            return (
                              <button
                                type="button"
                                onClick={() => toggleHighlight(bin)}
                                disabled={bin.count === 0}
                                class="flex-1 min-w-0 flex flex-col items-center justify-end h-full transition-opacity hover:opacity-80 disabled:cursor-default"
                                title={`${bin.start.toFixed(2)}–${bin.end.toFixed(2)} · ${bin.count}`}
                              >
                                <div
                                  class="w-full rounded-t transition-colors"
                                  classList={{
                                    'bg-violet-500': inThreshold() && bin.count > 0,
                                    'bg-stone-300 dark:bg-stone-600': !inThreshold() && bin.count > 0,
                                    'opacity-25': bin.count === 0,
                                    'ring-2 ring-violet-300 dark:ring-violet-500/60 ring-offset-1 ring-offset-white dark:ring-offset-stone-800':
                                      highlighted(),
                                  }}
                                  style={{ height: `${Math.max(bin.count > 0 ? 4 : 1, pct())}%` }}
                                />
                              </button>
                            );
                          }}
                        </For>
                      </div>
                      <div class="flex justify-between text-[9px] text-stone-400 font-mono mt-1">
                        <span>0.00</span>
                        <span>0.50</span>
                        <span>1.00</span>
                      </div>
                    </div>
                  </section>

                  {/* Above-threshold table */}
                  <ScoreTable
                    title={t('dev.menu.aboveThreshold')}
                    rows={aboveThreshold()}
                    scoreClass="text-rose-500"
                    expandedPair={expandedPair()}
                    onToggle={(p) => setExpandedPair(expandedPair() === pairKey(p) ? null : pairKey(p))}
                    pairKey={pairKey}
                  />

                  {/* Near-miss table */}
                  <ScoreTable
                    title={t('dev.menu.nearMisses')}
                    titleHint={t('dev.menu.nearMissesHint')}
                    rows={nearMisses()}
                    scoreClass="text-amber-500"
                    expandedPair={expandedPair()}
                    onToggle={(p) => setExpandedPair(expandedPair() === pairKey(p) ? null : pairKey(p))}
                    pairKey={pairKey}
                  />

                  {/* Pipeline stats */}
                  <section class="flex flex-col gap-2">
                    <h3 class="text-[10px] inkmirror-smallcaps text-stone-500 dark:text-stone-400 font-medium">
                      {t('dev.menu.pipelineStats')}
                    </h3>
                    <div class="grid grid-cols-2 gap-2 rounded-lg border border-stone-200 dark:border-stone-700 p-3 text-xs">
                      <Stat label={t('dev.menu.stats.candidatePairs')} value={r().candidatePairCount.toString()} />
                      <Stat label={t('dev.menu.stats.totalMs')} value={formatMs(r().totalScanMs)} />
                      <Stat label={t('dev.menu.stats.averageMs')} value={formatMs(r().averagePairMs)} />
                      <Stat label={t('dev.menu.stats.slowestMs')} value={formatMs(r().slowestPairMs)} />
                      <Stat label={t('dev.menu.stats.detectedLang')} value={r().detectedLang} />
                    </div>
                  </section>

                  {/* Trigger categories */}
                  <Show when={categories().length > 0}>
                    <section class="flex flex-col gap-2">
                      <h3 class="text-[10px] inkmirror-smallcaps text-stone-500 dark:text-stone-400 font-medium">
                        {t('dev.menu.triggerCategories')}
                      </h3>
                      <div class="rounded-lg border border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-1.5">
                        <For each={categories()}>
                          {(c) => {
                            const pct = () => (categoryMax() > 0 ? (c.count / categoryMax()) * 100 : 0);
                            return (
                              <div class="flex items-center gap-2 text-xs">
                                <span class="w-20 shrink-0 text-stone-500 dark:text-stone-400">{c.category}</span>
                                <div class="flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
                                  <div class="h-full bg-violet-500" style={{ width: `${pct()}%` }} />
                                </div>
                                <span class="w-8 text-right font-mono tabular-nums">{c.count}</span>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </section>
                  </Show>

                  <Show when={r().pairs.length === 0}>
                    <div class="text-xs text-stone-400 italic">{t('dev.menu.noPairs')}</div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};

interface ScoreTableProps {
  title: string;
  titleHint?: string;
  rows: readonly PairScoreData[];
  scoreClass: string;
  expandedPair: string | null;
  onToggle: (p: PairScoreData) => void;
  pairKey: (p: PairScoreData) => string;
}

const ScoreTable = (props: ScoreTableProps) => {
  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <h3 class="text-[10px] inkmirror-smallcaps text-stone-500 dark:text-stone-400 font-medium">
          {props.title}
        </h3>
        <Show when={props.titleHint}>
          <span class="text-[10px] text-stone-400">{props.titleHint}</span>
        </Show>
      </div>
      <Show
        when={props.rows.length > 0}
        fallback={
          <div class="rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs text-stone-400 italic">
            —
          </div>
        }
      >
        <div class="rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
          <table class="w-full text-xs">
            <thead class="text-[10px] text-stone-400 inkmirror-smallcaps">
              <tr>
                <th class="text-left px-2 py-1 w-14">{t('dev.menu.colScore')}</th>
                <th class="text-left px-2 py-1">{t('dev.menu.colSentenceA')}</th>
                <th class="text-left px-2 py-1">{t('dev.menu.colSentenceB')}</th>
                <th class="text-left px-2 py-1 w-24">{t('dev.menu.colCategories')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.rows}>
                {(p) => {
                  const expanded = () => props.expandedPair === props.pairKey(p);
                  return (
                    <>
                      <tr
                        class="border-t border-stone-100 dark:border-stone-700/50 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-700/30"
                        onClick={() => props.onToggle(p)}
                      >
                        <td class={`px-2 py-1 font-mono tabular-nums ${props.scoreClass}`}>
                          {formatScore(p.maxContradiction)}
                        </td>
                        <td class="px-2 py-1 text-stone-700 dark:text-stone-200">
                          {truncate(p.blockA.sentence, SENTENCE_TRUNCATE)}
                        </td>
                        <td class="px-2 py-1 text-stone-700 dark:text-stone-200">
                          {truncate(p.blockB.sentence, SENTENCE_TRUNCATE)}
                        </td>
                        <td class="px-2 py-1 text-[10px] text-stone-500">
                          {p.sharedCategories.join(', ')}
                        </td>
                      </tr>
                      <Show when={expanded()}>
                        <tr class="border-t border-stone-100 dark:border-stone-700/50 bg-stone-50/60 dark:bg-stone-700/20">
                          <td colspan={4} class="px-3 py-2">
                            <NliBreakdown pair={p} />
                          </td>
                        </tr>
                      </Show>
                    </>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </section>
  );
};

const NliBreakdown = (props: { pair: PairScoreData }) => {
  return (
    <div class="grid grid-cols-2 gap-3 text-[11px]">
      <NliDirection
        label={t('dev.menu.forward')}
        nli={props.pair.nliForward}
        ms={props.pair.scoreMs}
      />
      <NliDirection
        label={t('dev.menu.reverse')}
        nli={props.pair.nliReverse}
        ms={props.pair.scoreMs}
      />
    </div>
  );
};

const NliDirection = (props: {
  label: string;
  nli: { entailment: number; contradiction: number } | null;
  ms: number;
}) => {
  return (
    <div class="rounded-md border border-stone-200 dark:border-stone-700 px-2 py-1.5">
      <div class="text-[10px] text-stone-400 inkmirror-smallcaps mb-1">{props.label}</div>
      <Show
        when={props.nli}
        fallback={<span class="text-stone-400 italic text-[10px]">—</span>}
      >
        {(n) => (
          <div class="grid grid-cols-2 gap-x-2 font-mono tabular-nums text-[10px]">
            <span class="text-stone-500">{t('dev.menu.entailment')}</span>
            <span class="text-right">{formatScore(n().entailment)}</span>
            <span class="text-stone-500">{t('dev.menu.contradiction')}</span>
            <span class="text-right">{formatScore(n().contradiction)}</span>
          </div>
        )}
      </Show>
    </div>
  );
};

const Stat = (props: { label: string; value: string }) => (
  <div class="flex flex-col">
    <span class="text-[10px] text-stone-400 inkmirror-smallcaps">{props.label}</span>
    <span class="font-mono tabular-nums text-sm">{props.value}</span>
  </div>
);

export default DevMenu;
