export interface KeyContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  caretOffset: number;
  contentLength: number;
  atFirstLine: boolean;
  atLastLine: boolean;
}

export type KeyIntent =
  | { type: 'create-block-after' }
  | { type: 'delete-empty-block' }
  | { type: 'focus-previous' }
  | { type: 'focus-next' }
  | { type: 'move-block-up' }
  | { type: 'move-block-down' };

/**
 * Resolves a keyboard event context into a block-level intent, or null if
 * the key should be handled by the browser's default contenteditable behavior.
 *
 * Returns null during IME composition: commits and structural mutations must
 * wait until composition ends so accented / composed characters aren't lost.
 */
export function resolveKeyIntent(ctx: KeyContext): KeyIntent | null {
  if (ctx.isComposing) return null;

  if (ctx.altKey && ctx.key === 'ArrowUp') {
    return { type: 'move-block-up' };
  }
  if (ctx.altKey && ctx.key === 'ArrowDown') {
    return { type: 'move-block-down' };
  }

  // Enter only creates a new block when the caret is at the very end of
  // the current one. Mid-content Enter falls through to the browser's
  // default (a soft line break inside the block) so writers can write a
  // multi-line paragraph without getting their text split in half.
  if (
    ctx.key === 'Enter' &&
    !ctx.shiftKey &&
    ctx.caretOffset === ctx.contentLength
  ) {
    return { type: 'create-block-after' };
  }

  // Backspace at offset 0 only deletes the block when it is empty.
  // Non-empty blocks stay put — merging the tail into the previous block
  // was too destructive (it lost the block type, scene/dialogue metadata,
  // speaker, and sentiment), and users kept triggering it by accident
  // when their caret happened to be at the start of a line.
  if (ctx.key === 'Backspace' && ctx.caretOffset === 0) {
    if (ctx.contentLength === 0) return { type: 'delete-empty-block' };
    return null;
  }

  if (ctx.key === 'ArrowUp' && ctx.atFirstLine) {
    return { type: 'focus-previous' };
  }

  if (ctx.key === 'ArrowDown' && ctx.atLastLine) {
    return { type: 'focus-next' };
  }

  return null;
}
