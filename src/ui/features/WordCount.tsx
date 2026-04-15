import { createMemo, Show } from 'solid-js';
import { store } from '@/store/document';
import type { Block } from '@/types';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export const WordCount = () => {
  const stats = createMemo(() => {
    let total = 0;
    let chapterTotal = 0;
    const activeId = store.activeChapterId;
    for (const id of store.blockOrder) {
      const b: Block | undefined = store.blocks[id];
      if (!b || b.deleted_at || b.type === 'note') continue;
      const words = countWords(b.content);
      total += words;
      if (b.chapter_id === activeId) chapterTotal += words;
    }
    return { total, chapter: chapterTotal };
  });

  return (
    <div class="flex flex-col gap-2">
      <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
        Word count
      </div>
      <div class="px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-stone-400">document</div>
            <div class="font-mono text-lg leading-tight">{stats().total.toLocaleString()}</div>
          </div>
          <Show when={store.activeChapterId}>
            <div>
              <div class="text-[10px] uppercase tracking-wider text-stone-400">chapter</div>
              <div class="font-mono text-lg leading-tight">
                {stats().chapter.toLocaleString()}
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
