import { For, createSignal, Show } from 'solid-js';
import { store, createChapter, renameChapter, setActiveChapter } from '@/store/document';
import type { UUID } from '@/types';

export const Sidebar = () => {
  const [editingId, setEditingId] = createSignal<UUID | null>(null);
  const [draft, setDraft] = createSignal('');

  const startRename = (id: UUID, currentTitle: string) => {
    setEditingId(id);
    setDraft(currentTitle);
  };

  const commitRename = () => {
    const id = editingId();
    if (!id) return;
    renameChapter(id, draft());
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const handleNew = () => {
    createChapter();
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">Chapters</div>
        <button
          type="button"
          onClick={handleNew}
          title="New chapter"
          class="text-stone-500 hover:text-violet-500 dark:text-stone-400 dark:hover:text-violet-400 text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
        >
          +
        </button>
      </div>

      <div class="flex flex-col gap-0.5">
        <For
          each={store.chapters}
          fallback={<div class="text-stone-500 text-sm">No chapters</div>}
        >
          {(c) => {
            const isActive = () => store.activeChapterId === c.id;
            const isEditing = () => editingId() === c.id;
            return (
              <div
                onClick={() => !isEditing() && setActiveChapter(c.id)}
                onDblClick={() => startRename(c.id, c.title)}
                class="group relative py-1.5 pl-3 pr-2 text-sm text-stone-800 dark:text-stone-200 rounded cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                classList={{
                  'bg-stone-100 dark:bg-stone-700': isActive(),
                }}
                style={{
                  'border-left': isActive() ? '2px solid #7F77DD' : '2px solid transparent',
                }}
              >
                <Show
                  when={isEditing()}
                  fallback={<span>{c.title}</span>}
                >
                  <input
                    type="text"
                    value={draft()}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    ref={(el) => {
                      queueMicrotask(() => {
                        el.focus();
                        el.select();
                      });
                    }}
                    class="w-full bg-transparent outline-none border-b border-violet-500 text-stone-800 dark:text-stone-200"
                  />
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};
