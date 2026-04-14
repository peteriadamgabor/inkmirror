import { For, createSignal, Show } from 'solid-js';
import {
  store,
  createChapter,
  renameChapter,
  setActiveChapter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '@/store/document';
import type { UUID } from '@/types';

export const Sidebar = () => {
  const [editingChapterId, setEditingChapterId] = createSignal<UUID | null>(null);
  const [editingCharacterId, setEditingCharacterId] = createSignal<UUID | null>(null);
  const [draft, setDraft] = createSignal('');
  const [newCharDraft, setNewCharDraft] = createSignal('');

  const startRenameChapter = (id: UUID, currentTitle: string) => {
    setEditingChapterId(id);
    setDraft(currentTitle);
  };

  const commitChapterRename = () => {
    const id = editingChapterId();
    if (id) renameChapter(id, draft());
    setEditingChapterId(null);
  };

  const startRenameCharacter = (id: UUID, currentName: string) => {
    setEditingCharacterId(id);
    setDraft(currentName);
  };

  const commitCharacterRename = () => {
    const id = editingCharacterId();
    if (id) updateCharacter(id, { name: draft() });
    setEditingCharacterId(null);
  };

  const handleNewChapter = () => createChapter();

  const handleNewCharacter = () => {
    const name = newCharDraft().trim();
    if (!name) return;
    createCharacter(name);
    setNewCharDraft('');
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto flex flex-col gap-5">
      {/* --- Chapters --- */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
            Chapters
          </div>
          <button
            type="button"
            onClick={handleNewChapter}
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
              const isEditing = () => editingChapterId() === c.id;
              return (
                <div
                  onClick={() => !isEditing() && setActiveChapter(c.id)}
                  onDblClick={() => startRenameChapter(c.id, c.title)}
                  class="group relative py-1.5 pl-3 pr-2 text-sm text-stone-800 dark:text-stone-200 rounded cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                  classList={{
                    'bg-stone-100 dark:bg-stone-700': isActive(),
                  }}
                  style={{
                    'border-left': isActive() ? '2px solid #7F77DD' : '2px solid transparent',
                  }}
                >
                  <Show when={isEditing()} fallback={<span>{c.title}</span>}>
                    <input
                      type="text"
                      value={draft()}
                      onInput={(e) => setDraft(e.currentTarget.value)}
                      onBlur={commitChapterRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitChapterRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingChapterId(null);
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

      {/* --- Characters --- */}
      <div class="flex flex-col gap-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Characters
        </div>

        <div class="flex flex-col gap-0.5">
          <For
            each={store.characters}
            fallback={<div class="text-stone-500 text-xs italic">No characters yet</div>}
          >
            {(c) => {
              const isEditing = () => editingCharacterId() === c.id;
              return (
                <div
                  onDblClick={() => startRenameCharacter(c.id, c.name)}
                  class="group relative flex items-center gap-2 py-1 pl-2 pr-1 text-sm text-stone-800 dark:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <span
                    class="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ 'background-color': c.color }}
                  />
                  <Show when={isEditing()} fallback={<span class="flex-1">{c.name}</span>}>
                    <input
                      type="text"
                      value={draft()}
                      onInput={(e) => setDraft(e.currentTarget.value)}
                      onBlur={commitCharacterRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitCharacterRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingCharacterId(null);
                        }
                      }}
                      ref={(el) => {
                        queueMicrotask(() => {
                          el.focus();
                          el.select();
                        });
                      }}
                      class="flex-1 bg-transparent outline-none border-b border-violet-500 text-stone-800 dark:text-stone-200"
                    />
                  </Show>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCharacter(c.id);
                    }}
                    title="Delete character"
                    class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-opacity"
                  >
                    ×
                  </button>
                </div>
              );
            }}
          </For>
        </div>

        <div class="flex items-center gap-1 pt-1">
          <input
            type="text"
            value={newCharDraft()}
            onInput={(e) => setNewCharDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNewCharacter();
              }
            }}
            placeholder="+ Add character"
            class="flex-1 bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-xs text-stone-800 dark:text-stone-200 py-1 placeholder-stone-400"
          />
        </div>
      </div>
    </div>
  );
};
