import { describe, it, expect } from 'vitest';
import { resolveKeyIntent, type KeyContext } from './keybindings';

function ctx(overrides: Partial<KeyContext> = {}): KeyContext {
  return {
    key: 'a',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    caretOffset: 0,
    contentLength: 10,
    atFirstLine: false,
    atLastLine: false,
    ...overrides,
  };
}

describe('resolveKeyIntent', () => {
  it('returns null for normal typing keys', () => {
    expect(resolveKeyIntent(ctx({ key: 'a' }))).toBeNull();
    expect(resolveKeyIntent(ctx({ key: ' ' }))).toBeNull();
  });

  describe('Alt+Arrow reorder', () => {
    it('Alt+ArrowUp → move-block-up', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowUp', altKey: true }))).toEqual({
        type: 'move-block-up',
      });
    });

    it('Alt+ArrowDown → move-block-down', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowDown', altKey: true }))).toEqual({
        type: 'move-block-down',
      });
    });

    it('Alt+Arrow takes precedence over focus-previous / focus-next', () => {
      // at first line: plain ArrowUp would focus-previous, but altKey wins
      expect(
        resolveKeyIntent(ctx({ key: 'ArrowUp', altKey: true, atFirstLine: true })),
      ).toEqual({ type: 'move-block-up' });
    });

    it('returns null during IME composition even with altKey', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'ArrowUp', altKey: true, isComposing: true })),
      ).toBeNull();
    });
  });

  it('returns null while IME composition is active', () => {
    expect(resolveKeyIntent(ctx({ key: 'Enter', isComposing: true }))).toBeNull();
    expect(resolveKeyIntent(ctx({ key: 'Backspace', isComposing: true }))).toBeNull();
  });

  describe('Enter', () => {
    it('returns create-block-after intent when caret is at the end', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Enter', caretOffset: 10, contentLength: 10 })),
      ).toEqual({ type: 'create-block-after' });
    });

    it('returns null mid-content (falls through to browser soft newline)', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Enter', caretOffset: 4, contentLength: 10 })),
      ).toBeNull();
    });

    it('returns null for Shift+Enter (soft line break)', () => {
      expect(resolveKeyIntent(ctx({ key: 'Enter', shiftKey: true }))).toBeNull();
    });
  });

  describe('Backspace', () => {
    it('returns null at offset 0 with non-empty content (merge-with-previous was too destructive)', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 0, contentLength: 5 })),
      ).toBeNull();
    });

    it('returns delete-empty-block intent on an empty block', () => {
      expect(resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 0, contentLength: 0 }))).toEqual({
        type: 'delete-empty-block',
      });
    });

    it('returns null when caret is not at offset 0', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 3, contentLength: 10 })),
      ).toBeNull();
    });
  });

  describe('Slash menu trigger', () => {
    it('opens on "/" in an empty block', () => {
      expect(resolveKeyIntent(ctx({ key: '/', contentLength: 0 }))).toEqual({
        type: 'open-slash-menu',
      });
    });

    it('does not open on "/" in a non-empty block', () => {
      expect(resolveKeyIntent(ctx({ key: '/', contentLength: 7 }))).toBeNull();
    });

    it('does not open when combined with a modifier', () => {
      expect(
        resolveKeyIntent(ctx({ key: '/', contentLength: 0, ctrlKey: true })),
      ).toBeNull();
      expect(
        resolveKeyIntent(ctx({ key: '/', contentLength: 0, shiftKey: true })),
      ).toBeNull();
    });

    it('does not open during IME composition', () => {
      expect(
        resolveKeyIntent(ctx({ key: '/', contentLength: 0, isComposing: true })),
      ).toBeNull();
    });
  });

  describe('Ctrl+D duplicate', () => {
    it('Ctrl+D → duplicate-block', () => {
      expect(resolveKeyIntent(ctx({ key: 'd', ctrlKey: true }))).toEqual({
        type: 'duplicate-block',
      });
    });

    it('Cmd+D (metaKey) also duplicates', () => {
      expect(resolveKeyIntent(ctx({ key: 'D', metaKey: true }))).toEqual({
        type: 'duplicate-block',
      });
    });

    it('returns null when combined with Shift (reserved)', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'd', ctrlKey: true, shiftKey: true })),
      ).toBeNull();
    });

    it('returns null during IME composition', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'd', ctrlKey: true, isComposing: true })),
      ).toBeNull();
    });
  });

  describe('Ctrl+Shift+Enter insert above', () => {
    it('Ctrl+Shift+Enter → create-block-before', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Enter', ctrlKey: true, shiftKey: true })),
      ).toEqual({ type: 'create-block-before' });
    });

    it('plain Shift+Enter still falls through to soft line break', () => {
      expect(resolveKeyIntent(ctx({ key: 'Enter', shiftKey: true }))).toBeNull();
    });
  });

  describe('Ctrl+Shift+K delete block', () => {
    it('Ctrl+Shift+K → delete-block', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'k', ctrlKey: true, shiftKey: true })),
      ).toEqual({ type: 'delete-block' });
    });

    it('returns null during IME composition', () => {
      expect(
        resolveKeyIntent(
          ctx({ key: 'k', ctrlKey: true, shiftKey: true, isComposing: true }),
        ),
      ).toBeNull();
    });
  });

  describe('Alt+digit block type switch', () => {
    it('Alt+1 → change-block-type text', () => {
      expect(resolveKeyIntent(ctx({ key: '1', altKey: true }))).toEqual({
        type: 'change-block-type',
        blockType: 'text',
      });
    });

    it('Alt+2 → change-block-type dialogue', () => {
      expect(resolveKeyIntent(ctx({ key: '2', altKey: true }))).toEqual({
        type: 'change-block-type',
        blockType: 'dialogue',
      });
    });

    it('Alt+3 → change-block-type scene', () => {
      expect(resolveKeyIntent(ctx({ key: '3', altKey: true }))).toEqual({
        type: 'change-block-type',
        blockType: 'scene',
      });
    });

    it('Alt+4 → change-block-type note', () => {
      expect(resolveKeyIntent(ctx({ key: '4', altKey: true }))).toEqual({
        type: 'change-block-type',
        blockType: 'note',
      });
    });

    it('returns null for unmapped digits (Alt+5+)', () => {
      expect(resolveKeyIntent(ctx({ key: '5', altKey: true }))).toBeNull();
      expect(resolveKeyIntent(ctx({ key: '0', altKey: true }))).toBeNull();
    });

    it('returns null when modifiers are combined with Alt', () => {
      expect(
        resolveKeyIntent(ctx({ key: '1', altKey: true, ctrlKey: true })),
      ).toBeNull();
      expect(
        resolveKeyIntent(ctx({ key: '1', altKey: true, shiftKey: true })),
      ).toBeNull();
    });

    it('returns null during IME composition', () => {
      expect(
        resolveKeyIntent(ctx({ key: '1', altKey: true, isComposing: true })),
      ).toBeNull();
    });
  });

  describe('Arrow navigation', () => {
    it('returns focus-previous on ArrowUp at the first line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowUp', atFirstLine: true }))).toEqual({
        type: 'focus-previous',
      });
    });

    it('returns null on ArrowUp when not at the first line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowUp', atFirstLine: false }))).toBeNull();
    });

    it('returns focus-next on ArrowDown at the last line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowDown', atLastLine: true }))).toEqual({
        type: 'focus-next',
      });
    });

    it('returns null on ArrowDown when not at the last line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowDown', atLastLine: false }))).toBeNull();
    });
  });
});
