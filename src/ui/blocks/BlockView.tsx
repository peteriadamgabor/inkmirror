import { createEffect, onMount, Show } from 'solid-js';
import type { Block } from '@/types';
import {
  updateBlockContent,
  updateBlockType,
  updateDialogueSpeaker,
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
import { uiState } from '@/store/ui-state';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { resolveKeyIntent, type KeyContext } from './keybindings';
import { openSlashMenu } from '@/ui/shared/slashMenu';
import { debounce } from '@/utils/debounce';
import { SceneMetadataEditor } from './SceneMetadataEditor';
import { BlockTimestamp } from './BlockTimestamp';
import { recordKeystroke } from '@/workers/pulse-client';
import { applyTypographyReplacement } from '@/utils/typography';
import { t } from '@/i18n';
import {
  focusBlock,
  getCaretOffset,
  getSelectionOffsets,
  isCaretAtFirstLine,
  isCaretAtLastLine,
  restoreSelectionRange,
  setCaretOffset,
} from './block-caret';
import { BlockHeader } from './BlockHeader';
import { DRAG_MIME, useBlockDnd } from './useBlockDnd';
import { isPreviewing, previewState } from '@/store/preview';
import { PreviewBanner } from './PreviewBanner';

const COMMIT_DEBOUNCE_MS = 300;

export const BlockView = (props: { block: Block }) => {
  let el!: HTMLDivElement;
  let wrapperEl!: HTMLDivElement;
  let isFocused = false;
  let isComposing = false;

  const dnd = useBlockDnd({ block: props.block, wrapper: () => wrapperEl });

  const inPreview = () => isPreviewing(props.block.id);

  onMount(() => {
    const preview = previewState();
    if (preview && preview.blockId === props.block.id) {
      el.innerHTML = marksToHtml(preview.content, undefined);
    } else {
      el.innerHTML = marksToHtml(props.block.content, props.block.marks);
    }
  });

  // Rule 1: skip DOM writes while the block is focused or composing —
  // unless a non-user actor (undo/redo/remote sync) has explicitly
  // poked the externalSync pulse for THIS block, in which case we
  // force the write and restore the caret at end-of-text.
  let lastExternalRev = 0;
  createEffect(() => {
    const preview = previewState();
    const inPrev = preview !== null && preview.blockId === props.block.id;

    if (inPrev) {
      if (!el) return;
      const html = marksToHtml(preview!.content, undefined);
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
      return;
    }

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

  const dialogueSpeakerId = () =>
    props.block.metadata.type === 'dialogue' ? props.block.metadata.data.speaker_id : '';

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

  // Walk backward from this block within the same chapter and find the
  // nearest preceding scene block, returning its cast for Tab cycling.
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

  const applyMarkToggle = (type: MarkType): void => {
    const range = getSelectionOffsets(el);
    if (!range || range.end <= range.start) return;
    const { content, marks } = parseMarksFromDom(el);
    const next = toggleMark(marks, type, range.start, range.end, content.length);
    el.innerHTML = marksToHtml(content, next);
    // Restore the selection by walking the freshly-rendered DOM.
    restoreSelectionRange(el, range.start, range.end);
    updateBlockContent(props.block.id, content, { marks: next });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (inPreview()) return; // previewed block is read-only
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
          dnd.flashMoved();
        }
        break;
      }
      case 'move-block-down': {
        if (moveBlock(props.block.id, 'down')) {
          focusBlock(props.block.id, caret);
          dnd.flashMoved();
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

  const isPovSpeaker = () => {
    const pov = store.document?.pov_character_id;
    if (!pov) return false;
    return dialogueSpeakerId() === pov;
  };

  const dialogueSpeakerColor = () => {
    const id = dialogueSpeakerId();
    if (!id) return null;
    return store.characters.find((c) => c.id === id)?.color ?? null;
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
      onDragOver={dnd.onDragOver}
      onDragLeave={dnd.onDragLeave}
      onDrop={dnd.onDrop}
    >
      <Show when={inPreview()}>
        <PreviewBanner />
      </Show>
      <BlockHeader
        block={props.block}
        onDragStart={dnd.onDragStart}
        onDragEnd={dnd.onDragEnd}
      />
      {props.block.type === 'scene' && <SceneMetadataEditor block={props.block} />}
      <div
        ref={el}
        data-editable
        contentEditable={!inPreview()}
        role="textbox"
        aria-multiline="true"
        aria-label={`${t(`block.types.${props.block.type}`)}: ${t(`block.hints.${props.block.type}`)}`}
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
        classList={{
          'ring-2 ring-violet-300/50 dark:ring-violet-700/50': inPreview(),
        }}
        style={(() => {
          if (props.block.metadata.type !== 'dialogue') return undefined;
          const color = dialogueSpeakerColor();
          const pov = isPovSpeaker();
          if (!color && !pov) return undefined;
          // POV with an uncolored speaker falls back to the brand
          // accent so the cue still reads. POV is encoded purely via
          // a deeper tint (no left stripe) — DESIGN.md restricts
          // border-left accents to scene blocks only.
          const accent = color ?? 'var(--writer-violet)';
          const colored = color != null;
          const bgPct = colored ? (pov ? 22 : 12) : (pov ? 14 : 6);
          return {
            background: `color-mix(in srgb, ${accent} ${bgPct}%, transparent)`,
          };
        })()}
      />
      <BlockTimestamp createdAt={props.block.created_at} updatedAt={props.block.updated_at} />
    </div>
  );
};
