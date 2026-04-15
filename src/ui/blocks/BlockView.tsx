import { createEffect, onMount } from 'solid-js';
import type { Block, BlockType } from '@/types';
import {
  updateBlockContent,
  updateBlockType,
  createBlockAfter,
  duplicateBlock,
  splitBlockAtCaret,
  insertPastedParagraphs,
  mergeBlockWithPrevious,
  deleteBlock,
  moveBlock,
  store,
} from '@/store/document';
import { uiState } from '@/store/ui-state';
import { openContextMenuAt } from '@/ui/shared/contextMenu';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { resolveKeyIntent, type KeyContext } from './keybindings';
import { debounce } from '@/utils/debounce';
import { SENTIMENT_COLORS } from './sentiment-colors';
import { SceneMetadataEditor } from './SceneMetadataEditor';
import { BlockHistory } from './BlockHistory';
import { recordKeystroke } from '@/workers/pulse-client';

const TYPE_LABELS: Record<Block['type'], { label: string; className: string }> = {
  text:     { label: 'TEXT',     className: 'text-violet-500' },
  dialogue: { label: 'DIALOGUE', className: 'text-teal-600' },
  scene:    { label: 'SCENE',    className: 'text-orange-600' },
  note:     { label: 'NOTE',     className: 'text-stone-400' },
};

const COMMIT_DEBOUNCE_MS = 300;

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        return true;
      }
      remaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function isCaretAtFirstLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '30');
  return caretRect.top - elRect.top < lineHeight;
}

function isCaretAtLastLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '30');
  return elRect.bottom - caretRect.bottom < lineHeight;
}

function focusBlock(blockId: string, caretPosition: 'start' | 'end' | number = 'start'): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"] [data-editable]`,
    );
    if (!el) return;
    el.focus();
    const offset =
      caretPosition === 'start' ? 0 :
      caretPosition === 'end' ? (el.innerText?.length ?? 0) :
      caretPosition;
    setCaretOffset(el, offset);
  });
}

export const BlockView = (props: { block: Block }) => {
  let el!: HTMLDivElement;
  let isFocused = false;
  let isComposing = false;

  onMount(() => {
    el.innerText = props.block.content;
  });

  // Rule 1: skip DOM writes while the block is focused or composing.
  createEffect(() => {
    const incoming = props.block.content;
    if (isFocused || isComposing) return;
    if (el && el.innerText !== incoming) {
      el.innerText = incoming;
    }
  });

  const commitDebounced = debounce(() => {
    if (isComposing || !el) return;
    updateBlockContent(props.block.id, el.innerText);
  }, COMMIT_DEBOUNCE_MS);

  const onFocus = () => {
    isFocused = true;
  };

  const onBlur = () => {
    isFocused = false;
    if (!el) return;
    updateBlockContent(props.block.id, el.innerText);
  };

  const onInput = () => {
    if (isComposing) return;
    recordKeystroke();
    commitDebounced();
  };

  const onCompositionStart = () => {
    isComposing = true;
  };

  const onCompositionEnd = () => {
    isComposing = false;
    commitDebounced();
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;

    // Smart paste: if the clipboard contains paragraph breaks (\n\n or more),
    // split into multiple blocks so pasted wiki/article text keeps its
    // paragraph structure. Single-paragraph pastes fall through to the
    // in-place path below.
    if (/\n{2,}/.test(text)) {
      // Sync whatever's currently in the DOM into the store before the split,
      // so insertPastedParagraphs sees an accurate head/tail around the caret.
      updateBlockContent(props.block.id, el.innerText);
      const caret = getCaretOffset(el);
      const result = insertPastedParagraphs(props.block.id, caret, text);
      focusBlock(result.targetBlockId, result.caretOffset);
      return;
    }

    // Single-paragraph path: manual Range-based insertion. Firefox's
    // execCommand('insertText') can preserve the clipboard's source styling
    // even for the plain-text path, which shows up as pasted text suddenly
    // having the wiki's font. Raw DOM insertion gives us a bare text node
    // with no formatting.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    commitDebounced();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isComposing || e.isComposing) return;

    const caret = getCaretOffset(el);
    const len = el.innerText?.length ?? 0;
    const ctx: KeyContext = {
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      isComposing,
      caretOffset: caret,
      contentLength: len,
      atFirstLine: caret === 0 || isCaretAtFirstLine(el),
      atLastLine: caret === len || isCaretAtLastLine(el),
    };

    const intent = resolveKeyIntent(ctx);
    if (!intent) return;

    e.preventDefault();
    // Commit any pending typing before mutating block structure.
    updateBlockContent(props.block.id, el.innerText);

    switch (intent.type) {
      case 'create-block-after': {
        // If the caret is mid-content, split: head stays, tail moves to
        // the new block, caret jumps to the start of the new block.
        // If it's at the end, this is equivalent to the old "create empty".
        const newId = splitBlockAtCaret(props.block.id, caret);
        if (newId) focusBlock(newId, 'start');
        else {
          const fallback = createBlockAfter(props.block.id);
          focusBlock(fallback, 'start');
        }
        break;
      }
      case 'merge-with-previous': {
        const result = mergeBlockWithPrevious(props.block.id);
        if (result) focusBlock(result.previousId, result.cursorOffset);
        break;
      }
      case 'delete-empty-block': {
        const idx = store.blockOrder.indexOf(props.block.id);
        const previousId = idx > 0 ? store.blockOrder[idx - 1] : null;
        deleteBlock(props.block.id);
        if (previousId) focusBlock(previousId, 'end');
        break;
      }
      case 'focus-previous': {
        const idx = store.blockOrder.indexOf(props.block.id);
        if (idx > 0) focusBlock(store.blockOrder[idx - 1], 'end');
        break;
      }
      case 'focus-next': {
        const idx = store.blockOrder.indexOf(props.block.id);
        if (idx >= 0 && idx < store.blockOrder.length - 1) {
          focusBlock(store.blockOrder[idx + 1], 'start');
        }
        break;
      }
      case 'move-block-up': {
        if (moveBlock(props.block.id, 'up')) {
          focusBlock(props.block.id, caret);
        }
        break;
      }
      case 'move-block-down': {
        if (moveBlock(props.block.id, 'down')) {
          focusBlock(props.block.id, caret);
        }
        break;
      }
    }
  };

  const meta = () => TYPE_LABELS[props.block.type];
  const sentiment = () => store.sentiments[props.block.id];
  const mentionedChars = () => {
    const ids = store.characterMentions[props.block.id] ?? [];
    return ids
      .map((id) => store.characters.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
  };

  const openBlockMenu = (e: MouseEvent) => {
    e.stopPropagation();
    const trigger = e.currentTarget as HTMLElement;
    const currentType = props.block.type;
    const idx = store.blockOrder.indexOf(props.block.id);
    const isFirst = idx === 0;
    const isLast = idx === store.blockOrder.length - 1;

    const setType = (t: BlockType) => updateBlockType(props.block.id, t);

    const copyContent = async () => {
      try {
        await navigator.clipboard.writeText(props.block.content);
        toast.success('Block content copied');
      } catch {
        toast.error('Copy failed');
      }
    };

    const onDelete = async () => {
      const ok = await askConfirm({
        title: 'Delete block?',
        message: 'The block will be moved to the graveyard and can be restored later.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) deleteBlock(props.block.id);
    };

    openContextMenuAt(trigger, [
      { kind: 'header', label: 'Block type' },
      { label: 'Text',     active: currentType === 'text',     onSelect: () => setType('text') },
      { label: 'Dialogue', active: currentType === 'dialogue', onSelect: () => setType('dialogue') },
      { label: 'Scene',    active: currentType === 'scene',    onSelect: () => setType('scene') },
      { label: 'Note',     active: currentType === 'note',     onSelect: () => setType('note') },
      { kind: 'divider' },
      {
        label: 'Duplicate',
        onSelect: () => {
          const newId = duplicateBlock(props.block.id);
          if (newId) toast.success('Block duplicated');
        },
      },
      {
        label: 'Move up',
        disabled: isFirst,
        onSelect: () => moveBlock(props.block.id, 'up'),
      },
      {
        label: 'Move down',
        disabled: isLast,
        onSelect: () => moveBlock(props.block.id, 'down'),
      },
      { label: 'Copy content', onSelect: () => void copyContent() },
      { kind: 'divider' },
      { label: 'Delete block', danger: true, onSelect: () => void onDelete() },
    ], { align: 'right' });
  };

  return (
    <div
      class="py-2 transition-opacity duration-150"
      classList={{
        'opacity-30 hover:opacity-100 focus-within:opacity-100': uiState.focusMode,
      }}
      data-block-id={props.block.id}
    >
      <div class="flex items-center gap-2 mb-1 group/header">
        <span class={`text-[10px] uppercase tracking-wider font-medium ${meta().className}`}>
          {meta().label}
        </span>
        <button
          type="button"
          onClick={openBlockMenu}
          title="Block actions"
          class="text-stone-400 hover:text-violet-500 text-xs px-1 leading-none opacity-0 group-hover/header:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Open block menu"
        >
          ⋯
        </button>
        {sentiment() && (
          <span
            class={`text-[10px] uppercase tracking-wider font-medium ${
              SENTIMENT_COLORS[sentiment()!.label] ?? 'text-stone-400'
            }`}
          >
            · {sentiment()!.label}
          </span>
        )}
        <BlockHistory blockId={props.block.id} />
        {mentionedChars().length > 0 && (
          <span class="flex items-center gap-1 ml-1">
            {mentionedChars().map((c) => (
              <span
                class="w-2 h-2 rounded-full"
                style={{ 'background-color': c.color }}
                title={c.name}
              />
            ))}
          </span>
        )}
      </div>
      {props.block.type === 'scene' && <SceneMetadataEditor block={props.block} />}
      <div
        ref={el}
        data-editable
        contentEditable
        spellcheck={uiState.spellcheck}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100 whitespace-pre-wrap break-words outline-none px-3 py-1.5 rounded border border-stone-200/60 dark:border-stone-700/30 focus:border-stone-300 dark:focus:border-stone-600/60 transition-colors"
      />
    </div>
  );
};
