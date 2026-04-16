import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { store } from '@/store/document';
import { canUndo, canRedo } from '@/store/undo';
import { uiState } from '@/store/ui-state';

export interface DebugStats {
  fps: number;
  totalBlocks: number;
  visibleBlocks: number;
  chapterCount: number;
  characterCount: number;
  sentimentCoverage: string;
  undoDepth: string;
  memoryMb: string;
}

/**
 * Hidden by default. Toggle via the `debug.toggle` hotkey (Alt+Shift+`)
 * or from the command palette. Shows FPS, block stats, sentiment coverage,
 * undo depth, and memory usage.
 */
export const DebugOverlay = () => {
  const [fps, setFps] = createSignal(0);

  onMount(() => {
    let frames: number[] = [];
    let rafId = 0;
    const tick = (now: number) => {
      frames.push(now);
      const cutoff = now - 1000;
      while (frames.length > 0 && frames[0] < cutoff) frames.shift();
      setFps(frames.length);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(rafId));
  });

  const totalBlocks = createMemo(() => store.blockOrder.length);
  const chapterCount = createMemo(() => store.chapters.length);
  const characterCount = createMemo(() => store.characters.length);

  const sentimentCoverage = createMemo(() => {
    const total = store.blockOrder.length;
    if (total === 0) return '0/0';
    const analyzed = store.blockOrder.filter((id) => store.sentiments[id]).length;
    return `${analyzed}/${total}`;
  });

  const undoInfo = createMemo(() => {
    const u = canUndo() ? 'Y' : 'N';
    const r = canRedo() ? 'Y' : 'N';
    return `undo:${u} redo:${r}`;
  });

  const memoryMb = createMemo(() => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    if (!mem?.usedJSHeapSize) return '—';
    return `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
  });

  return (
    <Show when={uiState.debugMode}>
      <div class="fixed bottom-4 left-4 z-50 px-3 py-2 rounded-xl bg-stone-900/90 text-stone-100 text-[10px] font-mono leading-relaxed pointer-events-none max-w-[220px]">
        <div class="text-violet-400 mb-1">DEBUG</div>
        <div>fps: {fps()}</div>
        <div>blocks: {totalBlocks()}</div>
        <div>chapters: {chapterCount()}</div>
        <div>characters: {characterCount()}</div>
        <div>sentiment: {sentimentCoverage()}</div>
        <div>{undoInfo()}</div>
        <div>heap: {memoryMb()}</div>
        <div>focus: {uiState.focusMode ? 'Y' : 'N'} zen: {uiState.zenMode ? 'Y' : 'N'}</div>
      </div>
    </Show>
  );
};
