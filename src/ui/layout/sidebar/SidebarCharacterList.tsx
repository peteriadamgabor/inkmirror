import { createSignal, For, Show } from 'solid-js';
import {
  store,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  setPovCharacter,
} from '@/store/document';
import { openCharacterPage } from '@/store/ui-state';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { IconStar, IconTrash } from '@/ui/shared/icons';
import { t } from '@/i18n';
import type { UUID } from '@/types';

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const SidebarCharacterList = (props: Props) => {
  const [editingCharacterId, setEditingCharacterId] = createSignal<UUID | null>(null);
  const [draft, setDraft] = createSignal('');
  const [newCharDraft, setNewCharDraft] = createSignal('');

  const startRenameCharacter = (id: UUID, currentName: string) => {
    setEditingCharacterId(id);
    setDraft(currentName);
  };

  const commitCharacterRename = () => {
    const id = editingCharacterId();
    if (id) {
      if (!draft().trim()) {
        toast.error(t('toast.characterNameEmpty'));
      } else {
        updateCharacter(id, { name: draft() });
      }
    }
    setEditingCharacterId(null);
  };

  const handleNewCharacter = () => {
    const name = newCharDraft().trim();
    if (!name) {
      toast.error(t('sidebar.characterName'));
      return;
    }
    createCharacter(name);
    setNewCharDraft('');
  };

  return (
    <div class="flex flex-col gap-2">
      <button
        type="button"
        onClick={props.onToggleCollapsed}
        class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
      >
        <span class="text-[8px]">{props.collapsed ? '▸' : '▾'}</span>
        {t('sidebar.characters')}
      </button>

      <Show when={!props.collapsed}>
        <div class="flex flex-col gap-0.5">
          <For
            each={store.characters}
            fallback={<div class="text-stone-500 text-xs italic">—</div>}
          >
            {(c) => {
              const isEditing = () => editingCharacterId() === c.id;
              const isPov = () => store.document?.pov_character_id === c.id;
              const doDeleteCharacter = async () => {
                const ok = await askConfirm({
                  title: t('sidebar.characterDelete') + ` — ${c.name}`,
                  message: t('sidebar.characterDeleteBody'),
                  confirmLabel: t('common.delete'),
                  cancelLabel: t('common.cancel'),
                  danger: true,
                });
                if (!ok) return;
                deleteCharacter(c.id);
                toast.info(t('sidebar.characterDeletedToast', { name: c.name }));
              };
              const togglePov = () => setPovCharacter(isPov() ? null : c.id);
              return (
                <div
                  onDblClick={() => startRenameCharacter(c.id, c.name)}
                  class="group relative flex items-center gap-2 py-1 pl-2 pr-1 text-sm text-stone-800 dark:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <span
                    class="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ 'background-color': c.color }}
                  />
                  <Show when={isEditing()} fallback={
                    <span class="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => openCharacterPage(c.id)}
                        class="text-left hover:text-violet-500 transition-colors truncate"
                      >
                        {c.name}
                      </button>
                    </span>
                  }>
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
                  <Show when={!isEditing()}>
                    <div class="flex items-center gap-0.5 shrink-0">
                      {/* Star: visible + violet when POV, hidden until hover when not POV. One click toggles. */}
                      <button
                        type="button"
                        onClick={togglePov}
                        title={
                          isPov()
                            ? t('sidebar.characterUnpov')
                            : t('sidebar.characterPov')
                        }
                        data-testid="character-pov-toggle"
                        data-pov-active={isPov() ? '1' : undefined}
                        class="w-5 h-5 flex items-center justify-center rounded transition-[opacity,color]"
                        classList={{
                          'text-violet-500 opacity-100 hover:text-violet-600': isPov(),
                          'text-stone-400 opacity-0 group-hover:opacity-100 hover:text-violet-500':
                            !isPov(),
                        }}
                      >
                        <IconStar size={12} />
                      </button>
                      {/* Trash: always hidden, appears on hover, keeps the existing confirm dialog. */}
                      <button
                        type="button"
                        onClick={() => void doDeleteCharacter()}
                        title={t('sidebar.characterDelete')}
                        data-testid="character-delete"
                        class="w-5 h-5 flex items-center justify-center rounded text-stone-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-[opacity,color]"
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <div class="flex items-center gap-1 pt-1">
          <input
            type="text"
            aria-label={t('aria.newCharacterName')}
            value={newCharDraft()}
            onInput={(e) => setNewCharDraft(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNewCharacter();
              }
            }}
            placeholder={`+ ${t('sidebar.characterNew')}`}
            class="flex-1 bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-xs text-stone-800 dark:text-stone-200 py-1 placeholder-stone-400"
          />
        </div>
      </Show>
    </div>
  );
};
