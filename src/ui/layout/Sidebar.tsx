import { store } from '@/store/document';
import { For } from 'solid-js';

export const Sidebar = () => (
  <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto">
    <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400 mb-2">Chapters</div>
    <For each={store.chapters} fallback={<div class="text-stone-500 text-sm">No chapters</div>}>
      {(c) => (
        <div class="py-1 text-sm text-stone-800 dark:text-stone-200">{c.title}</div>
      )}
    </For>
  </div>
);
