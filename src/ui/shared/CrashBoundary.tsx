import { ErrorBoundary, createSignal, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { flushPendingWrites, store } from '@/store/document';
import { downloadBlob, sanitizeFilename } from '@/exporters';
import { loadExporter } from '@/exporters/registry';
import { t } from '@/i18n';
import { buildDiagnostic, copyToClipboard, formatDiagnostic } from '@/utils/diagnostic';
import { openFeedback } from './feedback';
import { circleStatus } from '@/sync';

async function emergencyExport(): Promise<void> {
  if (!store.document) return;
  try {
    await flushPendingWrites(500);
    const input = {
      document: store.document,
      chapters: store.chapters,
      blocks: store.blockOrder
        .map((id) => store.blocks[id])
        .filter(Boolean),
      characters: store.characters,
    };
    // Lazy-load through the registry so json.ts can split into its own
    // chunk; we still want a custom filename here, so call the exporter
    // directly rather than going through `runExportByFormat`.
    const exporter = await loadExporter('json');
    const blob = await exporter.run(input);
    const name = sanitizeFilename(store.document.title);
    downloadBlob(blob, `${name}-emergency-backup.json`);
  } catch {
    // At this point we've done our best. The backup either worked or
    // the app is too broken to produce one.
  }
}

export const CrashBoundary = (props: { children: JSX.Element }) => (
  <ErrorBoundary
    fallback={(err) => {
      // Try to flush whatever was pending to IDB before showing the error.
      void flushPendingWrites(500);

      const [copyState, setCopyState] = createSignal<'idle' | 'copied' | 'manual'>('idle');
      const [manualText, setManualText] = createSignal('');

      const handleCopy = async () => {
        // store / circleStatus may themselves be in a broken state if the
        // crash was deep in setup — guard each read.
        let docId: string | null = null;
        let syncEnabled = false;
        try { docId = store.document?.id ?? null; } catch { /* ignore */ }
        try { syncEnabled = circleStatus().kind === 'active'; } catch { /* ignore */ }

        const snap = buildDiagnostic({ error: err, lastActiveDocId: docId, syncEnabled });
        const text = formatDiagnostic(snap);
        const ok = await copyToClipboard(text);
        if (ok) {
          setCopyState('copied');
        } else {
          setManualText(text);
          setCopyState('manual');
        }
      };

      return (
        <div class="h-full w-full bg-stone-100 dark:bg-stone-900 flex items-center justify-center p-8">
          <div class="w-[480px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-red-200 dark:border-red-900 shadow-xl p-6 flex flex-col gap-4">
            <div>
              <div class="text-[10px] inkmirror-smallcaps text-red-500 mb-1">
                {t('crash.eyebrow')}
              </div>
              <div class="font-serif text-lg text-stone-900 dark:text-stone-50">
                {t('crash.headline')}
              </div>
            </div>
            <div class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {t('crash.body')}
            </div>
            <div class="font-mono text-xs text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg overflow-auto max-h-[120px]">
              {err instanceof Error ? err.message : String(err)}
            </div>
            <div class="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                class="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm hover:bg-violet-600 transition-colors"
              >
                {t('crash.reload')}
              </button>
              <button
                type="button"
                onClick={() => void emergencyExport()}
                class="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-200 hover:border-violet-500 transition-colors"
              >
                {t('crash.emergencyBackup')}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                class="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-200 hover:border-violet-500 transition-colors"
              >
                {t('crash.copyDiagnostics')}
              </button>
              <button
                type="button"
                onClick={() => openFeedback()}
                class="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-200 hover:border-violet-500 transition-colors"
              >
                {t('crash.sendFeedback')}
              </button>
            </div>
            <Show when={copyState() === 'copied'}>
              <div class="text-xs text-emerald-600 dark:text-emerald-400">
                {t('crash.diagnosticsCopied')}
              </div>
            </Show>
            <Show when={copyState() === 'manual'}>
              <div class="flex flex-col gap-1">
                <div class="text-xs text-stone-500 dark:text-stone-400">
                  {t('crash.diagnosticsCopyFailed')}
                </div>
                <textarea
                  readonly
                  class="font-mono text-[11px] text-stone-700 dark:text-stone-200 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 h-32 leading-tight"
                  value={manualText()}
                  onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
                />
              </div>
            </Show>
            <div class="text-[11px] text-stone-400 dark:text-stone-500 leading-snug">
              {t('crash.diagnosticsHint')}
            </div>
          </div>
        </div>
      );
    }}
  >
    {props.children}
  </ErrorBoundary>
);
