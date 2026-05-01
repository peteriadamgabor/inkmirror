import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  previewState,
  enterPreview,
  exitPreview,
  isPreviewing,
  commitPreview,
  cancelPreviewIfDocMatches,
} from './preview';
import * as repo from '@/db/repository';
import { store, setStore } from './document';

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

describe('commitPreview', () => {
  beforeEach(() => {
    exitPreview();
    vi.restoreAllMocks();
  });

  it('writes a pre-restore snapshot then restores the previewed content', async () => {
    const saveSpy = vi.spyOn(repo, 'saveRevision').mockResolvedValue();
    const saveBlockSpy = vi.spyOn(repo, 'saveBlock').mockResolvedValue();

    setStore('document', { id: 'doc-1', title: 't' } as any);
    setStore('blocks', 'block-1', {
      id: 'block-1',
      type: 'text',
      content: 'CURRENT LIVE CONTENT',
      updated_at: '2026-05-01T10:00:00Z',
    } as any);

    enterPreview('block-1', 'OLD VERSION', '2026-05-01T09:00:00Z');
    await commitPreview();

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ blockId: 'block-1', content: 'CURRENT LIVE CONTENT' }),
    );
    expect(saveBlockSpy).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'OLD VERSION' }),
      'doc-1',
    );
    expect(store.blocks['block-1'].content).toBe('OLD VERSION');
    expect(previewState()).toBeNull();
  });

  it('is a no-op if previewed content equals live content', async () => {
    const saveSpy = vi.spyOn(repo, 'saveRevision').mockResolvedValue();

    setStore('document', { id: 'doc-1' } as any);
    setStore('blocks', 'block-1', {
      id: 'block-1',
      content: 'SAME',
      updated_at: '2026-05-01T10:00:00Z',
    } as any);

    enterPreview('block-1', 'SAME', '2026-05-01T09:00:00Z');
    await commitPreview();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(previewState()).toBeNull();
  });

  it('aborts the restore (and re-throws) when the pre-restore snapshot fails', async () => {
    const failure = new Error('snapshot write failed');
    vi.spyOn(repo, 'saveRevision').mockRejectedValueOnce(failure);
    const saveBlockSpy = vi.spyOn(repo, 'saveBlock').mockResolvedValue();

    setStore('document', { id: 'doc-1' } as any);
    setStore('blocks', 'block-1', {
      id: 'block-1',
      content: 'STILL LIVE',
      updated_at: '2026-05-01T10:00:00Z',
    } as any);

    enterPreview('block-1', 'WOULD-BE OLD', '2026-05-01T09:00:00Z');

    await expect(commitPreview()).rejects.toThrow('snapshot write failed');
    expect(saveBlockSpy).not.toHaveBeenCalled();
    expect(store.blocks['block-1'].content).toBe('STILL LIVE');
    expect(previewState()).toBeNull();
  });
});

describe('cancelPreviewIfDocMatches', () => {
  beforeEach(() => {
    exitPreview();
  });

  it('cancels preview and returns true when the doc matches', () => {
    setStore('document', { id: 'doc-1' } as any);
    enterPreview('block-1', 'old', '2026-01-01T00:00:00Z');
    const cancelled = cancelPreviewIfDocMatches('doc-1');
    expect(cancelled).toBe(true);
    expect(previewState()).toBeNull();
  });

  it('does NOT cancel and returns false when the doc id does not match', () => {
    setStore('document', { id: 'doc-1' } as any);
    enterPreview('block-1', 'old', '2026-01-01T00:00:00Z');
    const cancelled = cancelPreviewIfDocMatches('doc-2');
    expect(cancelled).toBe(false);
    expect(previewState()).not.toBeNull();
  });

  it('returns false when no preview is active', () => {
    setStore('document', { id: 'doc-1' } as any);
    const cancelled = cancelPreviewIfDocMatches('doc-1');
    expect(cancelled).toBe(false);
  });
});
