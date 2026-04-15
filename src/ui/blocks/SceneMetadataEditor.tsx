import { For, Show } from 'solid-js';
import type { Block, SceneMetadata, UUID } from '@/types';
import { store, updateSceneMetadata } from '@/store/document';

export const SceneMetadataEditor = (props: { block: Block }) => {
  const scene = (): SceneMetadata | null =>
    props.block.metadata.type === 'scene' ? props.block.metadata.data : null;

  const toggleCharacter = (id: UUID) => {
    const s = scene();
    if (!s) return;
    const has = s.character_ids.includes(id);
    const next = has ? s.character_ids.filter((x) => x !== id) : [...s.character_ids, id];
    updateSceneMetadata(props.block.id, { character_ids: next });
  };

  return (
    <Show when={scene()}>
      {(s) => (
        <div class="mb-2 px-3 py-2 rounded-lg border border-orange-200/60 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20 text-xs flex flex-col gap-2">
          <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
            <label class="text-[10px] uppercase tracking-wider text-stone-500">Location</label>
            <input
              type="text"
              value={s().location}
              onInput={(e) => updateSceneMetadata(props.block.id, { location: e.currentTarget.value })}
              placeholder="—"
              class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-orange-500 text-stone-800 dark:text-stone-200 py-0.5"
            />
            <label class="text-[10px] uppercase tracking-wider text-stone-500">Time</label>
            <input
              type="text"
              value={s().time}
              onInput={(e) => updateSceneMetadata(props.block.id, { time: e.currentTarget.value })}
              placeholder="—"
              class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-orange-500 text-stone-800 dark:text-stone-200 py-0.5"
            />
            <label class="text-[10px] uppercase tracking-wider text-stone-500">Mood</label>
            <input
              type="text"
              value={s().mood}
              onInput={(e) => updateSceneMetadata(props.block.id, { mood: e.currentTarget.value })}
              placeholder="—"
              class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-orange-500 text-stone-800 dark:text-stone-200 py-0.5 col-span-3"
            />
          </div>
          <Show when={store.characters.length > 0}>
            <div class="flex flex-wrap gap-1 items-center">
              <span class="text-[10px] uppercase tracking-wider text-stone-500 mr-1">Cast</span>
              <For each={store.characters}>
                {(c) => {
                  const on = () => s().character_ids.includes(c.id);
                  return (
                    <button
                      type="button"
                      onClick={() => toggleCharacter(c.id)}
                      class="flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] transition-colors"
                      classList={{
                        'border-transparent bg-stone-100 dark:bg-stone-700 text-stone-500': !on(),
                        'border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-100': on(),
                      }}
                    >
                      <span
                        class="w-2 h-2 rounded-full"
                        style={{ 'background-color': c.color }}
                      />
                      {c.name}
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
};
