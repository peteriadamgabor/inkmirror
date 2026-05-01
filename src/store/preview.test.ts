import { describe, it, expect, beforeEach } from 'vitest';
import {
  previewState,
  enterPreview,
  exitPreview,
  isPreviewing,
} from './preview';

describe('preview store', () => {
  beforeEach(() => {
    exitPreview();
  });

  it('starts with no preview state', () => {
    expect(previewState()).toBeNull();
    expect(isPreviewing('block-1')).toBe(false);
  });

  it('enterPreview sets state', () => {
    enterPreview('block-1', 'old content', '2026-01-01T00:00:00Z');
    expect(previewState()).toEqual({
      blockId: 'block-1',
      content: 'old content',
      snapshotAt: '2026-01-01T00:00:00Z',
    });
    expect(isPreviewing('block-1')).toBe(true);
    expect(isPreviewing('block-2')).toBe(false);
  });

  it('enterPreview swaps state if already previewing', () => {
    enterPreview('block-1', 'first', '2026-01-01T00:00:00Z');
    enterPreview('block-1', 'second', '2026-01-02T00:00:00Z');
    expect(previewState()?.content).toBe('second');
  });

  it('exitPreview clears state', () => {
    enterPreview('block-1', 'old', '2026-01-01T00:00:00Z');
    exitPreview();
    expect(previewState()).toBeNull();
  });
});
