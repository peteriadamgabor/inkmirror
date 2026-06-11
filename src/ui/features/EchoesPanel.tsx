import { createEffect, For, on, Show } from 'solid-js';
import { store } from '@/store/document';
import {
  clearEchoReport,
  echoReport,
  echoScanning,
  echoScope,
  runEchoScan,
  setEchoScope,
  type EchoScope,
} from '@/store/echoes';
import { requestEditorSearch } from './editor-search-state';
import { t } from '@/i18n';

/**
 * Echoes — repeated-language mirror. Manual scan (like the consistency
 * panel), results grouped into overused words, close echoes, and
 * repeated phrases. Clicking a finding opens the search bar pre-filled
 * with it, so every occurrence lights up in the manuscript.
 */
export const EchoesPanel = () => {
  // A report describes a snapshot of specific text — drop it when the
  // document changes, or the chapter changes under chapter scope.
  createEffect(
    on(
      () => store.document?.id,
      () => clearEchoReport(),
      { defer: true },
    ),
  );
  createEffect(
    on(
      () => store.activeChapterId,
      () => {
        if (echoScope() === 'chapter') clearEchoReport();
      },
      { defer: true },
    ),
  );

  const report = () => echoReport();
  const hasFindings = () => {
    const r = report();
    return r !== null && (r.overused.length > 0 || r.echoes.length > 0 || r.phrases.length > 0);
  };

  const scopeButton = (scope: EchoScope, label: string) => (
    <button
      type="button"
      onClick={() => setEchoScope(scope)}
      class="px-1.5 py-0.5 rounded text-[9px] inkmirror-smallcaps transition-colors"
      classList={{
        'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50':
          echoScope() === scope,
        'text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 border border-transparent':
          echoScope() !== scope,
      }}
      aria-pressed={echoScope() === scope}
    >
      {label}
    </button>
  );

  return (
    <div class="flex flex-col gap-2" data-testid="echoes-panel">
      <div class="flex items-center justify-between gap-2">
        <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
          {t('echoes.title')}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          {scopeButton('chapter', t('echoes.scopeChapter'))}
          {scopeButton('document', t('echoes.scopeDocument'))}
          <button
            type="button"
            disabled={echoScanning()}
            onClick={() => void runEchoScan()}
            class="ml-1 text-[10px] font-medium text-violet-500 hover:text-violet-600 disabled:text-stone-400 disabled:cursor-not-allowed inkmirror-smallcaps"
          >
            {echoScanning() ? t('echoes.scanning') : t('echoes.runNow')}
          </button>
        </div>
      </div>

      <Show
        when={report()}
        fallback={
          <div class="rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs text-stone-500 dark:text-stone-400 italic">
            {t('echoes.empty.notYetRun')}
          </div>
        }
      >
        {(r) => (
          <Show
            when={hasFindings()}
            fallback={
              <div class="rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs text-stone-500 dark:text-stone-400 italic">
                {t('echoes.empty.clean')}
              </div>
            }
          >
            <div class="flex flex-col gap-2">
              <Show when={r().overused.length > 0}>
                <EchoGroup title={t('echoes.groups.overused')} count={r().overused.length}>
                  <For each={r().overused}>
                    {(w) => (
                      <FindingRow
                        label={w.term}
                        detail={t('echoes.perThousand', { n: w.perThousand.toFixed(1) })}
                        count={w.count}
                        onClick={() => requestEditorSearch(w.term)}
                      />
                    )}
                  </For>
                </EchoGroup>
              </Show>

              <Show when={r().echoes.length > 0}>
                <EchoGroup title={t('echoes.groups.echoes')} count={r().echoes.length}>
                  <For each={r().echoes}>
                    {(e) => (
                      <FindingRow
                        label={e.term}
                        detail={t('echoes.echoGap', { n: String(e.minGapTokens) })}
                        count={e.count}
                        onClick={() => requestEditorSearch(e.term)}
                      />
                    )}
                  </For>
                </EchoGroup>
              </Show>

              <Show when={r().phrases.length > 0}>
                <EchoGroup title={t('echoes.groups.phrases')} count={r().phrases.length}>
                  <For each={r().phrases}>
                    {(p) => (
                      <FindingRow
                        label={`“${p.phrase}”`}
                        count={p.count}
                        onClick={() => requestEditorSearch(p.phrase)}
                      />
                    )}
                  </For>
                </EchoGroup>
              </Show>

              <div class="text-[9px] text-stone-400 px-1 tabular-nums">
                {t('echoes.scannedWords', { n: String(r().totalWords) })}
              </div>
            </div>
          </Show>
        )}
      </Show>
    </div>
  );
};

function EchoGroup(props: { title: string; count: number; children?: import('solid-js').JSX.Element }) {
  return (
    <div class="rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-700">
        <div class="text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">
          {props.title}
        </div>
        <div class="ml-auto text-[10px] text-stone-400 font-mono">{props.count}</div>
      </div>
      <div class="flex flex-col">{props.children}</div>
    </div>
  );
}

function FindingRow(props: {
  label: string;
  detail?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={t('echoes.findHint')}
      class="flex items-baseline gap-2 px-3 py-1.5 text-xs text-left border-b border-stone-100 dark:border-stone-700/50 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors w-full"
    >
      <span class="text-stone-700 dark:text-stone-200 italic truncate">{props.label}</span>
      <Show when={props.detail}>
        <span class="text-[9px] text-stone-400 shrink-0">{props.detail}</span>
      </Show>
      <span class="ml-auto font-mono text-[10px] text-violet-500 dark:text-violet-400 shrink-0 tabular-nums">
        ×{props.count}
      </span>
    </button>
  );
}
