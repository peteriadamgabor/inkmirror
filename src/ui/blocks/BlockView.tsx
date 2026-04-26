import { createEffect, onMount } from 'solid-js';
import type { Block, BlockType } from '@/types';
import {
  updateBlockContent,
  updateBlockType,
  updateDialogueSpeaker,
  updateDialogueParenthetical,
  matchLeadingSpeaker,
  createBlockAfter,
  createBlockBefore,
  duplicateBlock,
  insertPastedParagraphs,
  deleteBlock,
  moveBlock,
  moveBlockToPosition,
  store,
} from '@/store/document';
import { externalSync } from '@/store/undo';
import { unwrap } from 'solid-js/store';
import { marksToHtml, parseMarksFromDom, toggleMark } from '@/engine/marks';
import type { MarkType } from '@/types/block';
import { uiState, openCharacterPage } from '@/store/ui-state';
import { openContextMenuAt, type ContextMenuItem } from '@/ui/shared/contextMenu';
import { IconDots, IconDrag, IconChevron, IconTrash, IconPlus } from '@/ui/shared/icons';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { resolveKeyIntent, type KeyContext } from './keybindings';
import { openSlashMenu } from '@/ui/shared/slashMenu';
import { debounce } from '@/utils/debounce';
import { SENTIMENT_COLORS } from './sentiment-colors';
import { SceneMetadataEditor } from './SceneMetadataEditor';
import { BlockHistory } from './BlockHistory';
import { BlockTimestamp } from './BlockTimestamp';
import { recordKeystroke } from '@/workers/pulse-client';
import { applyTypographyReplacement } from '@/utils/typography';
import { t } from '@/i18n';

const TYPE_META: Record<Block['type'], { labelKey: string; className: string; hintKey: string }> = {
  text:     { labelKey: 'block.types.text',     className: 'text-violet-500', hintKey: 'block.hints.text' },
  dialogue: { labelKey: 'block.types.dialogue', className: 'text-teal-600',   hintKey: 'block.hints.dialogue' },
  scene:    { labelKey: 'block.types.scene',    className: 'text-orange-600', hintKey: 'block.hints.scene' },
  note:     { labelKey: 'block.types.note',     className: 'text-stone-400',  hintKey: 'block.hints.note' },
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

/**
 * Restore a non-collapsed selection by walking text nodes until the
 * cumulative character count reaches `start` and `end`. Used after
 * mark-toggle re-renders the block's innerHTML.
 */
function restoreSelectionRange(el: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = start;
  let startSet = false;
  let endRemaining = end;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (!startSet && remaining <= len) {
        range.setStart(node, remaining);
        startSet = true;
      } else if (!startSet) {
        remaining -= len;
      }
      if (startSet && endRemaining <= len) {
        range.setEnd(node, endRemaining);
        return true;
      }
      endRemaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  sel.removeAllRanges();
  sel.addRange(range);
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

const DRAG_MIME = 'application/x-inkmirror-block-id';

export const BlockView = (props: { block: Block }) => {
  let el!: HTMLDivElement;
  let wrapperEl!: HTMLDivElement;
  let isFocused = false;
  let isComposing = false;

  onMount(() => {
    el.innerHTML = marksToHtml(props.block.content, props.block.marks);
  });

  // Rule 1: skip DOM writes while the block is focused or composing —
  // unless a non-user actor (undo/redo/remote sync) has explicitly
  // poked the externalSync pulse for THIS block, in which case we
  // force the write and restore the caret at end-of-text.
  let lastExternalRev = 0;
  createEffect(() => {
    const incoming = props.block.content;
    const marks = props.block.marks;
    const pulse = externalSync();
    const isExternal =
      pulse?.blockId === props.block.id && pulse.rev !== lastExternalRev;
    if (isExternal) lastExternalRev = pulse.rev;
    if (!isExternal && (isFocused || isComposing)) return;
    if (!el) return;
    const html = marksToHtml(incoming, marks);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      if (isExternal && isFocused) {
        // Park the caret at the end of the newly-written content.
        // Without this the browser leaves the selection on a node that
        // was just replaced, which feels like nothing happened.
        setCaretOffset(el, el.innerText?.length ?? 0);
      }
    }
  });

  const commitDebounced = debounce(() => {
    if (isComposing || !el) return;
    const { content, marks } = parseMarksFromDom(el);
    updateBlockContent(props.block.id, content, { marks });
  }, COMMIT_DEBOUNCE_MS);

  const onFocus = () => {
    isFocused = true;
    // Typewriter scroll: when focus mode is on, center the active block in
    // the editor viewport. Defer to a microtask so the focus settles before
    // the scroll computation reads layout.
    if (uiState.focusMode && wrapperEl) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      queueMicrotask(() => {
        wrapperEl?.scrollIntoView({
          block: 'center',
          behavior: reduced ? 'auto' : 'smooth',
        });
      });
    }
  };

  const onBlur = () => {
    isFocused = false;
    if (!el) return;
    // detectSpeaker is safe here: blur means the DOM is no longer being
    // actively typed, so the content-sync effect in the store→DOM path
    // will pick up any speaker-strip side effect without a caret fight.
    const { content, marks } = parseMarksFromDom(el);
    updateBlockContent(props.block.id, content, { detectSpeaker: true, marks });
  };

  const onInput = () => {
    if (isComposing) return;
    recordKeystroke();

    // Auto-typography: --, ..., and (when the doc opts in) smart quotes.
    // Operates on the single Text node at the caret so existing inline
    // marks (<strong>, <em>) on sibling nodes stay untouched.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      if (
        container.nodeType === Node.TEXT_NODE &&
        el.contains(container)
      ) {
        const style = store.document?.settings.dialogue_style ?? 'straight';
        const smartQuotes = style !== 'straight';
        const result = applyTypographyReplacement(
          container as Text,
          range.startOffset,
          smartQuotes,
        );
        if (result.replaced) {
          const newRange = document.createRange();
          newRange.setStart(container, result.offset);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
    }

    // Live dialogue leading-"Name: " detect. When the user types
    // "Alice: " inside a dialogue block with no speaker yet, strip the
    // prefix and assign Alice immediately — same feel as a chat app.
    // DOM, store, and caret all get updated together so there's no
    // mid-typing desync.
    if (props.block.type === 'dialogue' && !dialogueSpeakerId()) {
      const current = el.innerText;
      const match = matchLeadingSpeaker(current, unwrap(store.characters));
      if (match) {
        el.innerHTML = marksToHtml(match.rest, undefined);
        setCaretOffset(el, match.rest.length);
        updateDialogueSpeaker(props.block.id, match.character.id);
        updateBlockContent(props.block.id, match.rest, { marks: [] });
        return;
      }
    }

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
      const { content, marks } = parseMarksFromDom(el);
      updateBlockContent(props.block.id, content, { marks });
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

  // Tab / Shift+Tab inside a dialogue block cycles through the speaker
  // list — scene cast first when one exists, otherwise every character.
  // Runs before the regular intent resolver so Tab never falls through
  // to the browser's focus-advance while you're in a dialogue block.
  const cycleSpeaker = (direction: 1 | -1): boolean => {
    if (props.block.type !== 'dialogue') return false;
    const castIds = sceneCastIds();
    const pool = castIds
      ? castIds
          .map((id) => store.characters.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
      : store.characters;
    if (pool.length === 0) return false;
    const currentId = dialogueSpeakerId();
    const currentIdx = currentId ? pool.findIndex((c) => c.id === currentId) : -1;
    const nextIdx =
      currentIdx === -1
        ? direction === 1 ? 0 : pool.length - 1
        : (currentIdx + direction + pool.length) % pool.length;
    updateDialogueSpeaker(props.block.id, pool[nextIdx].id);
    return true;
  };

  // Get the current selection's character offsets relative to `el`'s
  // plain-text content. Returns null if there's no selection inside
  // this block or if collapsed (caret only, no range to mark).
  const getSelectionOffsets = (): { start: number; end: number } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
      return null;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    return { start, end };
  };

  const applyMarkToggle = (type: MarkType): void => {
    const range = getSelectionOffsets();
    if (!range || range.end <= range.start) return;
    const { content, marks } = parseMarksFromDom(el);
    const next = toggleMark(marks, type, range.start, range.end, content.length);
    el.innerHTML = marksToHtml(content, next);
    // Restore the selection by walking the freshly-rendered DOM.
    restoreSelectionRange(el, range.start, range.end);
    updateBlockContent(props.block.id, content, { marks: next });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isComposing || e.isComposing) return;

    // Bold / italic toggles. Run before the intent resolver so Cmd+B
    // inside a contenteditable doesn't fall through to the browser's
    // deprecated execCommand('bold'), which would produce inconsistent
    // output (some browsers insert <b>, some <strong>, some inline
    // style attributes).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        applyMarkToggle('bold');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        applyMarkToggle('italic');
        return;
      }
    }

    if (e.key === 'Tab' && props.block.type === 'dialogue') {
      if (cycleSpeaker(e.shiftKey ? -1 : 1)) {
        e.preventDefault();
        return;
      }
    }

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
    // Commit any pending typing (with marks) before mutating block structure.
    {
      const { content, marks } = parseMarksFromDom(el);
      updateBlockContent(props.block.id, content, { marks });
    }

    switch (intent.type) {
      case 'create-block-after': {
        // Enter only fires this intent when the caret is at the end of
        // the block (see keybindings.ts), so there's nothing to split.
        // Inherit the source block's type to keep dialogue runs flowing.
        const newId = createBlockAfter(props.block.id, props.block.type);
        focusBlock(newId, 'start');
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
          flashMoved();
        }
        break;
      }
      case 'move-block-down': {
        if (moveBlock(props.block.id, 'down')) {
          focusBlock(props.block.id, caret);
          flashMoved();
        }
        break;
      }
      case 'change-block-type': {
        if (intent.blockType !== props.block.type) {
          updateBlockType(props.block.id, intent.blockType);
          focusBlock(props.block.id, caret);
        }
        break;
      }
      case 'create-block-before': {
        const newId = createBlockBefore(props.block.id, props.block.type);
        focusBlock(newId, 'start');
        break;
      }
      case 'duplicate-block': {
        const newId = duplicateBlock(props.block.id);
        if (newId) {
          focusBlock(newId, 'end');
          toast.success(t('block.duplicated'));
        }
        break;
      }
      case 'delete-block': {
        void (async () => {
          const ok = await askConfirm({
            title: t('block.deleteConfirmTitle'),
            message: t('block.deleteConfirmBody'),
            confirmLabel: t('common.delete'),
            danger: true,
          });
          if (ok) {
            const idx = store.blockOrder.indexOf(props.block.id);
            const previousId = idx > 0 ? store.blockOrder[idx - 1] : null;
            const nextId = idx >= 0 && idx < store.blockOrder.length - 1
              ? store.blockOrder[idx + 1]
              : null;
            deleteBlock(props.block.id);
            if (previousId) focusBlock(previousId, 'end');
            else if (nextId) focusBlock(nextId, 'start');
          }
        })();
        break;
      }
      case 'open-slash-menu': {
        const rect = el.getBoundingClientRect();
        void (async () => {
          const picked = await openSlashMenu({ x: rect.left, y: rect.bottom + 4 });
          if (picked && picked !== props.block.type) {
            updateBlockType(props.block.id, picked);
          }
          focusBlock(props.block.id, 'start');
        })();
        break;
      }
    }
  };

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
  const isPovSpeaker = () => {
    const pov = store.document?.pov_character_id;
    if (!pov) return false;
    return dialogueSpeakerId() === pov;
  };

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

  // ---------- drag and drop reordering ----------

  const onDragStart = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, props.block.id);
    // A subtle visual: dim the source while it's in flight.
    wrapperEl.setAttribute('data-dragging', '1');
  };

  const onDragEnd = () => {
    wrapperEl?.removeAttribute('data-dragging');
    wrapperEl?.removeAttribute('data-drop-before');
    wrapperEl?.removeAttribute('data-drop-after');
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Pick a side based on the pointer's vertical position inside the row.
    const rect = wrapperEl.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    wrapperEl.setAttribute(before ? 'data-drop-before' : 'data-drop-after', '1');
    wrapperEl.removeAttribute(before ? 'data-drop-after' : 'data-drop-before');
  };

  const onDragLeave = () => {
    wrapperEl?.removeAttribute('data-drop-before');
    wrapperEl?.removeAttribute('data-drop-after');
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData(DRAG_MIME);
    wrapperEl.removeAttribute('data-drop-before');
    wrapperEl.removeAttribute('data-drop-after');
    if (!sourceId || sourceId === props.block.id) return;
    const rect = wrapperEl.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const targetIdx = store.blockOrder.indexOf(props.block.id);
    if (targetIdx < 0) return;
    const insertAt = before ? targetIdx : targetIdx + 1;
    moveBlockToPosition(sourceId, insertAt);
  };

  const flashMoved = () => {
    // Solid's For re-renders visible blocks while the store mutates, so
    // the wrapperEl ref may not point at the same DOM node right after
    // a move. Query fresh from the block id to be safe.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-block-id="${props.block.id}"]`,
      );
      if (!el) return;
      el.dataset.justMoved = '1';
      setTimeout(() => delete el.dataset.justMoved, 350);
    });
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

  // Fresh blocks (created within the last half second) get a one-shot
  // enter animation. Long-existing blocks that scroll into view via
  // the virtualizer are not re-animated.
  const isFreshBlock = () => {
    const created = new Date(props.block.created_at).getTime();
    return Date.now() - created < 500;
  };

  return (
    <div
      ref={(el) => {
        wrapperEl = el;
        if (isFreshBlock()) {
          el.dataset.justAdded = '1';
          setTimeout(() => delete el.dataset.justAdded, 250);
        }
      }}
      class="py-3 transition-opacity duration-150 relative group/block"
      classList={{
        'opacity-30 hover:opacity-100 focus-within:opacity-100': uiState.focusMode,
      }}
      data-block-id={props.block.id}
      data-block-type={props.block.type}
      data-pov-speaker={isPovSpeaker() ? '1' : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div class="flex items-center gap-1.5 mb-1 group/header flex-wrap">
        <div
          draggable="true"
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          class="flex items-center justify-center text-stone-400 hover:text-violet-500 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity select-none shrink-0"
          title={t('block.dragToReorder')}
          aria-label={t('aria.dragHandle')}
        >
          <IconDrag size={14} />
        </div>
        <button
          type="button"
          onClick={openTypeQuickMenu}
          class={`text-[10px] uppercase tracking-wider font-medium cursor-pointer hover:underline ${meta().className}`}
          title={`${meta().hint} (${t('block.changeType')})`}
        >
          {meta().label}
        </button>
        {props.block.type === 'dialogue' && (
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
        )}
        {props.block.type === 'dialogue' && (
          <input
            type="text"
            value={dialogueParenthetical()}
            onInput={(e) => updateDialogueParenthetical(props.block.id, e.currentTarget.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder={`(${t('block.parenthetical')})`}
            class="bg-transparent outline-none text-[10px] italic text-stone-500 dark:text-stone-400 placeholder-stone-300 dark:placeholder-stone-600 border-b border-transparent focus:border-teal-500 w-[110px] py-0.5"
            title={t('misc.parentheticalHelp')}
          />
        )}
        {sentiment() && (
          <span
            class={`text-[10px] uppercase tracking-wider font-medium ${
              SENTIMENT_COLORS[sentiment()!.label] ?? 'text-stone-400'
            }`}
          >
            · {sentiment()!.label}
          </span>
        )}
        {mentionedChars().length > 0 && (
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
                data-mention-character-id={c.id}
              />
            ))}
          </span>
        )}
        <span class="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); const id = createBlockAfter(props.block.id, 'text'); focusBlock(id, 'start'); }}
            title={t('block.insertBelow')}
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
        onDragOver={(e) => {
          // Cancel contenteditable's native text-drop handling when a
          // block-level drag is in flight, so our wrapper's onDragOver
          // / onDrop decide the outcome. Without this, the contenteditable
          // absorbs the event and nothing reorders.
          if (e.dataTransfer?.types.includes(DRAG_MIME)) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer?.types.includes(DRAG_MIME)) {
            e.preventDefault();
            // Let the wrapper handler decide insertion side — mirror its
            // drop logic here so the event doesn't get eaten by the
            // contenteditable's default "insert text at caret" path.
            const sourceId = e.dataTransfer.getData(DRAG_MIME);
            if (sourceId && sourceId !== props.block.id) {
              const rect = wrapperEl.getBoundingClientRect();
              const before = e.clientY < rect.top + rect.height / 2;
              const targetIdx = store.blockOrder.indexOf(props.block.id);
              if (targetIdx >= 0) {
                moveBlockToPosition(sourceId, before ? targetIdx : targetIdx + 1);
              }
            }
            wrapperEl.removeAttribute('data-drop-before');
            wrapperEl.removeAttribute('data-drop-after');
          }
        }}
        class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100 whitespace-pre-wrap break-words outline-none px-4 py-2 rounded-xl border border-transparent hover:border-stone-200/60 dark:hover:border-stone-700/40 focus:border-stone-300 dark:focus:border-stone-600/60 transition-colors"
        style={(() => {
          if (props.block.metadata.type !== 'dialogue') return undefined;
          const color = dialogueSpeakerColor();
          const pov = isPovSpeaker();
          if (!color && !pov) return undefined;
          // POV with an uncolored speaker falls back to the brand
          // accent so the cue still reads.
          const accent = color ?? '#7F77DD';
          const bgPct = color ? 12 : 6;
          const style: Record<string, string> = {
            background: `color-mix(in srgb, ${accent} ${bgPct}%, transparent)`,
          };
          if (pov) style['border-left'] = `3px solid ${accent}`;
          return style;
        })()}
      />
      <BlockTimestamp createdAt={props.block.created_at} updatedAt={props.block.updated_at} />
    </div>
  );
};
