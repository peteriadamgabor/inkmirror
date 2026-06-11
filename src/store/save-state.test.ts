/**
 * Finding: failed IndexedDB writes used to drain `pendingWrites` and land
 * on 'saved' — the writer saw "Saved" while nothing persisted. These tests
 * pin the fix: a rejecting repo write flips the indicator to 'error' and
 * fires the injected notifier exactly once per cooldown window, and a
 * later successful write returns the indicator to 'saved'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as repo from '@/db/repository';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document } from '@/types';
import {
  loadSyntheticDoc,
  persistBlockNow,
  saveState,
  setPersistEnabled,
  setPersistErrorNotifier,
  resetPersistErrorStateForTests,
} from './document';

vi.mock('@/db/repository', () => ({
  saveBlock: vi.fn(),
  saveRevision: vi.fn(),
}));

function makeBlock(id: string, chapterId: string, order: number, content: string): Block {
  return {
    id,
    chapter_id: chapterId,
    type: 'text',
    content,
    order,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
  };
}

function makeDoc(): SyntheticDoc {
  const chapter: Chapter = {
    id: 'ch1',
    document_id: 'd1',
    title: 'Chapter 1',
    order: 0,
    kind: 'standard',
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
  };
  const document: Document = {
    id: 'd1',
    title: 'Test',
    author: 'Test',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
  };
  return {
    document,
    chapters: [chapter],
    blocks: [
      makeBlock('b1', 'ch1', 0, 'first'),
      makeBlock('b2', 'ch1', 1, 'second'),
      makeBlock('b3', 'ch1', 2, 'third'),
    ],
  };
}

describe('save-state error surface', () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.mocked(repo.saveBlock).mockReset();
    vi.mocked(repo.saveRevision).mockReset().mockResolvedValue(undefined);
    // notifyPersistError logs the real error for diagnostics — keep the
    // test output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    notify.mockReset();
    resetPersistErrorStateForTests();
    setPersistErrorNotifier(notify);
    setPersistEnabled(true);
    loadSyntheticDoc(makeDoc());
  });

  afterEach(() => {
    setPersistErrorNotifier(null);
    setPersistEnabled(true);
    vi.restoreAllMocks();
  });

  it('a rejecting repo write flips the indicator to error and fires the notifier', async () => {
    vi.mocked(repo.saveBlock).mockRejectedValue(new Error('quota exceeded'));

    persistBlockNow('b1');
    expect(saveState()).toBe('saving');

    await vi.waitFor(() => expect(saveState()).toBe('error'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a burst of failing writes notifies only once (cooldown)', async () => {
    vi.mocked(repo.saveBlock).mockRejectedValue(new Error('quota exceeded'));

    persistBlockNow('b1');
    persistBlockNow('b2');
    persistBlockNow('b3');

    await vi.waitFor(() => expect(saveState()).toBe('error'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a later successful write returns the indicator to saved', async () => {
    vi.mocked(repo.saveBlock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);

    persistBlockNow('b1');
    await vi.waitFor(() => expect(saveState()).toBe('error'));

    persistBlockNow('b1');
    await vi.waitFor(() => expect(saveState()).toBe('saved'));
    // The toast already informed the user — no second notification.
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a successful batch lands on saved and never notifies', async () => {
    vi.mocked(repo.saveBlock).mockResolvedValue(undefined);

    persistBlockNow('b1');
    await vi.waitFor(() => expect(saveState()).toBe('saved'));
    expect(notify).not.toHaveBeenCalled();
  });
});
