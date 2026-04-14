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
  | { type: 'merge-with-previous' }
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

  if (ctx.key === 'Enter' && !ctx.shiftKey) {
    return { type: 'create-block-after' };
  }

  if (ctx.key === 'Backspace' && ctx.caretOffset === 0) {
    if (ctx.contentLength === 0) return { type: 'delete-empty-block' };
    return { type: 'merge-with-previous' };
  }

  if (ctx.key === 'ArrowUp' && ctx.atFirstLine) {
    return { type: 'focus-previous' };
  }

  if (ctx.key === 'ArrowDown' && ctx.atLastLine) {
    return { type: 'focus-next' };
  }

  return null;
}
