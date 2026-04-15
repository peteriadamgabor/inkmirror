import { createSignal, For, Show } from 'solid-js';
import type { Block, DialogueMetadata } from '@/types';
import { store, updateDialogueSpeaker } from '@/store/document';

export const DialogueSpeakerEditor = (props: { block: Block }) => {
  const [open, setOpen] = createSignal(false);

  const data = (): DialogueMetadata | null =>
    props.block.metadata.type === 'dialogue' ? props.block.metadata.data : null;

  const assigned = () => {
    const d = data();
    if (!d || !d.speaker_id) return null;
    return store.characters.find((c) => c.id === d.speaker_id) ?? null;
  };

  const pick = (id: string | null) => {
    updateDialogueSpeaker(props.block.id, id);
    setOpen(false);
  };

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <Show when={data()}>
      <div class="mb-2 relative">
        <button
          type="button"
          onClick={toggle}
          class="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-stone-200 dark:border-stone-700 text-[11px] text-stone-700 dark:text-stone-200 hover:border-teal-500 hover:text-teal-600 transition-colors"
        >
          <Show
            when={assigned()}
            fallback={
              <>
                <span class="w-2 h-2 rounded-full border border-stone-300 dark:border-stone-600" />
                <span class="italic text-stone-400">(unassigned)</span>
              </>
            }
          >
            {(c) => (
              <>
                <span
                  class="w-2 h-2 rounded-full"
                  style={{ 'background-color': c().color }}
                />
                <span>{c().name}</span>
              </>
            )}
          </Show>
          <span class="text-stone-400 text-[9px]">▾</span>
        </button>

        <Show when={open()}>
          <div
            class="absolute left-0 top-7 z-20 w-[200px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={store.characters.length > 0}
              fallback={
                <div class="text-xs text-stone-400 italic px-2 py-3 text-center">
                  No characters yet — add one in the sidebar.
                </div>
              }
            >
              <div class="flex flex-col">
                <button
                  type="button"
                  onClick={() => pick(null)}
                  class="text-left px-2 py-1.5 rounded text-xs text-stone-500 italic hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  Unassigned
                </button>
                <For each={store.characters}>
                  {(c) => {
                    const active = () => assigned()?.id === c.id;
                    return (
                      <button
                        type="button"
                        onClick={() => pick(c.id)}
                        class="text-left px-2 py-1.5 rounded text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-2"
                        classList={{ 'bg-stone-100 dark:bg-stone-700': active() }}
                      >
                        <span
                          class="w-2 h-2 rounded-full shrink-0"
                          style={{ 'background-color': c.color }}
                        />
                        <span class="flex-1">{c.name}</span>
                        <Show when={active()}>
                          <span class="text-violet-500 text-[10px]">·</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};
