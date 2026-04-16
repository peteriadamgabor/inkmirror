import { ErrorBoundary } from 'solid-js';
import type { JSX } from 'solid-js';
import { flushPendingWrites, store } from '@/store/document';
import { jsonExporter } from '@/exporters/json';
import { downloadBlob, sanitizeFilename } from '@/exporters';

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
    const blob = await jsonExporter.run(input);
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
      return (
        <div class="h-full w-full bg-stone-100 dark:bg-stone-900 flex items-center justify-center p-8">
          <div class="w-[480px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-red-200 dark:border-red-900 shadow-xl p-6 flex flex-col gap-4">
            <div>
              <div class="text-[10px] uppercase tracking-wider text-red-500 mb-1">
                Something went wrong
              </div>
              <div class="font-serif text-lg text-stone-900 dark:text-stone-50">
                InkMirror hit an unexpected error
              </div>
            </div>
            <div class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              Your latest edits were flushed to the browser's storage. You can
              try reloading the page. If the problem persists, download an
              emergency backup below — it contains everything in your current
              document as JSON.
            </div>
            <div class="font-mono text-xs text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg overflow-auto max-h-[120px]">
              {err instanceof Error ? err.message : String(err)}
            </div>
            <div class="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                class="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm hover:bg-violet-600 transition-colors"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => void emergencyExport()}
                class="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-200 hover:border-violet-500 transition-colors"
              >
                Download emergency backup
              </button>
            </div>
          </div>
        </div>
      );
    }}
  >
    {props.children}
  </ErrorBoundary>
);
