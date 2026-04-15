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
