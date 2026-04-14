import { createSignal, Show } from 'solid-js';
import { useTheme } from '@/ui/theme';
import { store } from '@/store/document';
import { getAiClient } from '@/ai';

export const RightPanel = () => {
  const { theme, toggleTheme } = useTheme();
  const ai = getAiClient();
  const [lastResult, setLastResult] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const activeBlockText = (): string => {
    const activeId = store.activeChapterId;
    if (!activeId) return '';
    const firstId = store.blockOrder.find(
      (id) => store.blocks[id]?.chapter_id === activeId && !store.blocks[id]?.deleted_at,
    );
    if (!firstId) return '';
    return store.blocks[firstId]?.content ?? '';
  };

  const runDetect = async () => {
    setBusy(true);
    setLastResult(null);
    const text = activeBlockText();
    if (!text.trim()) {
      setLastResult('no text in active block');
      setBusy(false);
      return;
    }
    const start = performance.now();
    try {
      const results = await ai.detectLanguage(text);
      const elapsed = Math.round(performance.now() - start);
      const top = results[0];
      if (top) {
        setLastResult(`${top.label} (${Math.round(top.score * 100)}%, ${elapsed}ms)`);
      } else {
        setLastResult(`no result (${elapsed}ms)`);
      }
    } catch (err) {
      setLastResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col gap-4 overflow-auto">
      <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
        Settings
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
        aria-label="Toggle theme"
      >
        <span>Theme</span>
        <span class="font-mono text-xs text-stone-500 dark:text-stone-400">
          {theme() === 'dark' ? '🌙 dark' : '☀ light'}
        </span>
      </button>

      <div class="flex flex-col gap-2 mt-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          AI (debug)
        </div>
        <button
          type="button"
          onClick={runDetect}
          disabled={!ai.isReady() || busy()}
          class="flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>Detect language</span>
          <span class="font-mono text-[10px] text-stone-500 dark:text-stone-400">
            {busy()
              ? 'running…'
              : ai.isReady()
              ? 'ready'
              : ai.loadError()
              ? 'error'
              : 'loading…'}
          </span>
        </button>
        <Show when={lastResult()}>
          <div class="text-xs font-mono text-stone-600 dark:text-stone-300 px-1 break-all">
            → {lastResult()}
          </div>
        </Show>
        <Show when={ai.loadError()}>
          <div class="text-[10px] text-red-500 px-1 break-all">
            {ai.loadError()}
          </div>
        </Show>
      </div>
    </div>
  );
};
