/**
 * The clickable chrome above each block: drag handle, type label,
 * dialogue speaker chip + parenthetical, sentiment tag, character
 * mention dots, and the row of micro-actions (insert / delete /
 * history / overflow). Pure render + menus — has no awareness of the
 * contenteditable below it.
 */

import { Show } from 'solid-js';
import {
  store,
  createBlockAfter,
  deleteBlock,
  duplicateBlock,
  moveBlock,
  updateBlockType,
  updateDialogueSpeaker,
  updateDialogueParenthetical,
} from '@/store/document';
import { openCharacterPage } from '@/store/ui-state';
import { openContextMenuAt, type ContextMenuItem } from '@/ui/shared/contextMenu';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { IconChevron, IconDots, IconDrag, IconPlus, IconTrash } from '@/ui/shared/icons';
import { t } from '@/i18n';
import type { Block, BlockType } from '@/types';
import { BlockHistory } from './BlockHistory';
import { focusBlock } from './block-caret';
import { SENTIMENT_COLORS } from './sentiment-colors';

const TYPE_META: Record<Block['type'], { labelKey: string; className: string; hintKey: string }> = {
  text:     { labelKey: 'block.types.text',     className: 'text-violet-500', hintKey: 'block.hints.text' },
  dialogue: { labelKey: 'block.types.dialogue', className: 'text-teal-600',   hintKey: 'block.hints.dialogue' },
  scene:    { labelKey: 'block.types.scene',    className: 'text-orange-600', hintKey: 'block.hints.scene' },
  note:     { labelKey: 'block.types.note',     className: 'text-stone-400 dark:text-stone-300',  hintKey: 'block.hints.note' },
};

interface Props {
  block: Block;
  /** Drag-start handler from the parent's `useBlockDnd` — wired onto the
   *  drag handle inside the header so the wrapper element stays the
   *  drag source. */
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}

export const BlockHeader = (props: Props) => {
  const meta = () => {
    const m = TYPE_META[props.block.type];
    return { label: t(m.labelKey), className: m.className, hint: t(m.hintKey) };
  };
  const sentiment = () => store.sentiments[props.block.id];
  const mentionedChars = () => {
    const ids = store.characterMentions[props.block.id] ?? [];
    return ids
      .map((id) => store.characters.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
  };
  const dialogueSpeakerId = () => {
    if (props.block.metadata.type !== 'dialogue') return '';
    return props.block.metadata.data.speaker_id;
  };
  const dialogueSpeaker = () => {
    const id = dialogueSpeakerId();
    if (!id) return null;
    return store.characters.find((c) => c.id === id) ?? null;
  };
  const dialogueSpeakerColor = () => dialogueSpeaker()?.color ?? null;
  const dialogueParenthetical = () =>
    props.block.metadata.type === 'dialogue'
      ? props.block.metadata.data.parenthetical ?? ''
      : '';

  // Walk backward from this block within the same chapter and find the
  // nearest preceding scene block. If it defines a cast, return those
  // character ids — the speaker picker will narrow itself to this cast
  // so dialogue in a scene only suggests the characters actually present.
  const sceneCastIds = (): string[] | null => {
    const chapterId = props.block.chapter_id;
    const idx = store.blockOrder.indexOf(props.block.id);
    for (let i = idx - 1; i >= 0; i--) {
      const b = store.blocks[store.blockOrder[i]];
      if (!b || b.chapter_id !== chapterId) break;
      if (b.type === 'scene' && b.metadata.type === 'scene') {
        const ids = b.metadata.data.character_ids;
        return ids.length > 0 ? ids : null;
      }
    }
    return null;
  };

  const openSpeakerMenu = (e: MouseEvent) => {
    e.stopPropagation();
    const trigger = e.currentTarget as HTMLElement;
    const currentId = dialogueSpeakerId();
    const castIds = sceneCastIds();
    const items: ContextMenuItem[] = [
      {
        kind: 'header',
        label: castIds ? t('block.speakerMenuSceneCast') : t('block.speakerMenuTitle'),
      },
      {
        label: t('block.speakerUnassigned'),
        active: !currentId,
        onSelect: () => updateDialogueSpeaker(props.block.id, null),
      },
    ];

    const allChars = store.characters;
    const castChars = castIds
      ? castIds
          .map((id) => allChars.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
      : [];
    const restChars = castIds
      ? allChars.filter((c) => !castIds.includes(c.id))
      : allChars;

    if (castChars.length > 0) {
      items.push({ kind: 'divider' });
      for (const c of castChars) {
        items.push({
          label: c.name,
          active: c.id === currentId,
          onSelect: () => updateDialogueSpeaker(props.block.id, c.id),
        });
      }
    }
    if (restChars.length > 0) {
      items.push({ kind: 'divider' });
      if (castChars.length > 0) {
        items.push({ kind: 'header', label: t('block.menuAllCharacters') });
      }
      for (const c of restChars) {
        items.push({
          label: c.name,
          active: c.id === currentId,
          onSelect: () => updateDialogueSpeaker(props.block.id, c.id),
        });
      }
    }
    openContextMenuAt(trigger, items);
  };

  // One-click type change from the header label: opens a compact menu
  // right under the label so users don't have to drill into the ⋯ menu
  // just to switch text → dialogue. Same infrastructure as the block
  // menu, just the type rows.
  const openTypeQuickMenu = (e: MouseEvent) => {
    e.stopPropagation();
    const trigger = e.currentTarget as HTMLElement;
    const currentType = props.block.type;
    const setType = (bt: BlockType) => updateBlockType(props.block.id, bt);
    openContextMenuAt(
      trigger,
      [
        { kind: 'header', label: t('block.menuBlockType') },
        { label: t('block.types.text'),     hint: currentType === 'text' ? '·' : '',     active: currentType === 'text',     onSelect: () => setType('text') },
        { label: t('block.types.dialogue'), active: currentType === 'dialogue', onSelect: () => setType('dialogue') },
        { label: t('block.types.scene'),    active: currentType === 'scene',    onSelect: () => setType('scene') },
        { label: t('block.types.note'),     active: currentType === 'note',     onSelect: () => setType('note') },
      ],
      { align: 'left' },
    );
  };

  const openBlockMenu = (e: MouseEvent) => {
    e.stopPropagation();
    const trigger = e.currentTarget as HTMLElement;
    const currentType = props.block.type;
    const idx = store.blockOrder.indexOf(props.block.id);
    const isFirst = idx === 0;
    const isLast = idx === store.blockOrder.length - 1;

    const setType = (bt: BlockType) => updateBlockType(props.block.id, bt);

    const copyContent = async () => {
      try {
        await navigator.clipboard.writeText(props.block.content);
        toast.success(t('block.contentCopied'));
      } catch {
        toast.error(t('block.copyFailed'));
      }
    };

    const onDelete = async () => {
      const ok = await askConfirm({
        title: t('block.deleteConfirmTitle'),
        message: t('block.deleteConfirmBody'),
        confirmLabel: t('common.delete'),
        danger: true,
      });
      if (ok) deleteBlock(props.block.id);
    };

    openContextMenuAt(trigger, [
      { kind: 'header', label: t('block.convertTo') },
      { label: t('block.types.text'),     active: currentType === 'text',     onSelect: () => setType('text') },
      { label: t('block.types.dialogue'), active: currentType === 'dialogue', onSelect: () => setType('dialogue') },
      { label: t('block.types.scene'),    active: currentType === 'scene',    onSelect: () => setType('scene') },
      { label: t('block.types.note'),     active: currentType === 'note',     onSelect: () => setType('note') },
      { kind: 'divider' },
      { label: t('block.insertBelow'), onSelect: () => { const id = createBlockAfter(props.block.id, 'text'); focusBlock(id, 'start'); } },
      { label: t('block.duplicate'), onSelect: () => { const id = duplicateBlock(props.block.id); if (id) toast.success(t('block.duplicated')); } },
      { label: t('block.copyContent'), onSelect: () => void copyContent() },
      { kind: 'divider' },
      { label: t('block.moveUp'), disabled: isFirst, onSelect: () => moveBlock(props.block.id, 'up') },
      { label: t('block.moveDown'), disabled: isLast, onSelect: () => moveBlock(props.block.id, 'down') },
      { kind: 'divider' },
      { label: t('block.deleteBlock'), danger: true, onSelect: () => void onDelete() },
    ], { align: 'right' });
  };

  return (
    <div class="flex items-center gap-1.5 mb-1 group/header flex-wrap">
      <div
        draggable="true"
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        class="flex items-center justify-center text-stone-400 hover:text-violet-500 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity select-none shrink-0"
        title={t('block.dragToReorder')}
        aria-label={t('aria.dragHandle')}
      >
        <IconDrag size={14} />
      </div>
      <button
        type="button"
        onClick={openTypeQuickMenu}
        class={`text-[10px] inkmirror-smallcaps cursor-pointer hover:underline ${meta().className}`}
        title={`${meta().hint} (${t('block.changeType')})`}
      >
        {meta().label}
      </button>
      <Show when={props.block.type === 'dialogue'}>
        <button
          type="button"
          onClick={openSpeakerMenu}
          class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors"
          classList={{
            'border-stone-200 dark:border-stone-700 text-stone-400 italic hover:text-teal-600 hover:border-teal-500':
              !dialogueSpeaker(),
            'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-teal-500':
              !!dialogueSpeaker(),
          }}
          title={t('block.speakerChange')}
        >
          <span
            class="w-2 h-2 rounded-full"
            style={
              dialogueSpeakerColor()
                ? { 'background-color': dialogueSpeakerColor()! }
                : undefined
            }
            classList={{
              'border border-stone-300 dark:border-stone-600': !dialogueSpeakerColor(),
            }}
          />
          <span>{dialogueSpeaker()?.name ?? t('block.speakerPlaceholder')}</span>
          <IconChevron size={10} class="text-stone-400" />
        </button>
        <input
          type="text"
          value={dialogueParenthetical()}
          onInput={(e) => updateDialogueParenthetical(props.block.id, e.currentTarget.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={`(${t('block.parenthetical')})`}
          aria-label={t('block.parenthetical')}
          class="bg-transparent outline-none text-[10px] italic text-stone-500 dark:text-stone-400 placeholder-stone-300 dark:placeholder-stone-600 border-b border-transparent focus:border-teal-500 w-[110px] py-0.5"
          title={t('misc.parentheticalHelp')}
        />
      </Show>
      <Show when={sentiment()}>
        <span
          class={`text-[10px] inkmirror-smallcaps ${
            SENTIMENT_COLORS[sentiment()!.label] ?? 'text-stone-400'
          }`}
        >
          · {sentiment()!.label}
        </span>
      </Show>
      <Show when={mentionedChars().length > 0}>
        <span class="flex items-center gap-0.5">
          {mentionedChars().map((c) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCharacterPage(c.id);
              }}
              class="w-2 h-2 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-offset-white dark:hover:ring-offset-stone-800 transition-[box-shadow]"
              style={{
                'background-color': c.color,
                '--tw-ring-color': c.color,
              }}
              title={c.name}
              aria-label={c.name}
              data-mention-character-id={c.id}
            />
          ))}
        </span>
      </Show>
      <span class="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); const id = createBlockAfter(props.block.id, 'text'); focusBlock(id, 'start'); }}
          title={t('block.insertBelow')}
          aria-label={t('block.insertBelow')}
          class="text-stone-400 hover:text-violet-500 px-0.5 leading-none"
        >
          <IconPlus size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void (async () => {
              const ok = await askConfirm({
                title: t('block.deleteConfirmTitle'),
                message: t('block.deleteConfirmBodyShort'),
                confirmLabel: t('common.delete'),
                danger: true,
              });
              if (ok) deleteBlock(props.block.id);
            })();
          }}
          title={t('block.deleteBlock')}
          aria-label={t('block.deleteBlock')}
          class="text-stone-400 hover:text-red-500 px-0.5 leading-none"
        >
          <IconTrash size={13} />
        </button>
        <BlockHistory blockId={props.block.id} />
      </span>
      <button
        type="button"
        onClick={openBlockMenu}
        title={t('misc.blockActions')}
        class="text-stone-400 hover:text-violet-500 px-0.5 leading-none opacity-0 group-hover/header:opacity-100 focus:opacity-100 transition-opacity"
        aria-label={t('block.openMenu')}
      >
        <IconDots size={14} />
      </button>
    </div>
  );
};
