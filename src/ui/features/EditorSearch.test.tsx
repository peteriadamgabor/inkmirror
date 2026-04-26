import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { EditorSearch } from './EditorSearch';
import {
  loadSyntheticDoc,
  setPersistEnabled,
  store,
} from '@/store/document';
import { setSearchOpen, uiState } from '@/store/ui-state';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document } from '@/types';

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
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
}

function makeDoc(): SyntheticDoc {
  const chapter: Chapter = {
    id: 'ch1',
    document_id: 'd1',
    title: 'Chapter 1',
    order: 0,
    kind: 'standard',
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
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
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
  return {
    document,
    chapters: [chapter],
    blocks: [
      makeBlock('b1', 'ch1', 0, 'The cat sat on the mat.'),
      makeBlock('b2', 'ch1', 1, 'Another cat appeared from nowhere.'),
      makeBlock('b3', 'ch1', 2, 'No felines in this paragraph.'),
    ],
  };
}

function searchInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('[data-search-bar] input[type="text"]') as HTMLInputElement;
}

function replaceInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(
    '[data-testid="search-replace-input"]',
  ) as HTMLInputElement;
}

describe('EditorSearch', () => {
  beforeAll(() => setPersistEnabled(false));
  afterAll(() => setPersistEnabled(true));

  beforeEach(() => {
    loadSyntheticDoc(makeDoc());
    setSearchOpen(false);
  });

  afterEach(() => {
    setSearchOpen(false);
    cleanup();
  });

  it('renders nothing when the search bar is closed', () => {
    const r = render(() => <EditorSearch />);
    expect(r.container.querySelector('[data-search-bar]')).toBeNull();
  });

  it('renders the search bar when opened and shows hits for a query that matches two blocks', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'cat' } });
    await waitFor(() => {
      const counter = r.container.querySelector('[data-testid="search-counter"]');
      expect(counter?.textContent).toMatch(/\b2\b/);
    });
  });

  it('shows the empty-state copy when the query has no matches', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'platypus' } });
    await waitFor(() => {
      const counter = r.container.querySelector('[data-testid="search-counter"]');
      // Empty-state copy lives at search.empty — anything but a "1/2"-style ratio.
      expect(counter?.textContent ?? '').not.toMatch(/\d+\s*\/\s*\d+/);
    });
  });

  it('does not match queries shorter than two characters', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'a' } });
    await waitFor(() => {
      const counter = r.container.querySelector('[data-testid="search-counter"]');
      expect((counter?.textContent ?? '').trim()).toBe('');
    });
  });

  it('Escape inside the search input closes the bar', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.keyDown(searchInput(r.container), { key: 'Escape' });
    await waitFor(() => expect(uiState.searchOpen).toBe(false));
  });

  it('Replace one rewrites the active block and decrements the hit count', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'cat' } });
    fireEvent.input(replaceInput(r.container), { target: { value: 'dog' } });
    const replaceOne = r.container.querySelector(
      '[data-testid="search-replace-one"]',
    ) as HTMLButtonElement;
    fireEvent.click(replaceOne);
    await waitFor(() => {
      // One of the two original blocks should now contain 'dog' instead of 'cat'.
      const allContent = Object.values(store.blocks)
        .map((b) => b.content)
        .join(' ');
      expect(allContent).toContain('dog');
    });
    await waitFor(() => {
      const counter = r.container.querySelector('[data-testid="search-counter"]');
      expect(counter?.textContent).toMatch(/\b1\b/);
    });
  });

  it('Replace all rewrites every match in one pass', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'cat' } });
    fireEvent.input(replaceInput(r.container), { target: { value: 'dog' } });
    const replaceAll = r.container.querySelector(
      '[data-testid="search-replace-all"]',
    ) as HTMLButtonElement;
    fireEvent.click(replaceAll);
    await waitFor(() => {
      const allContent = Object.values(store.blocks)
        .map((b) => b.content)
        .join(' ');
      expect(allContent).not.toContain('cat');
      // Both original "cat" occurrences should have become "dog".
      const dogCount = (allContent.match(/dog/g) ?? []).length;
      expect(dogCount).toBe(2);
    });
  });

  it('next button advances the cursor through matches', async () => {
    setSearchOpen(true);
    const r = render(() => <EditorSearch />);
    await waitFor(() => expect(r.container.querySelector('[data-search-bar]')).toBeTruthy());
    fireEvent.input(searchInput(r.container), { target: { value: 'cat' } });
    await waitFor(() => {
      expect(
        r.container.querySelector('[data-testid="search-counter"]')?.textContent,
      ).toMatch(/1.*2/);
    });
    // The "next" button is the second navigation arrow (after prev). Look for
    // the button whose accessible label/title contains "Next" or "next".
    const nextBtn = Array.from(
      r.container.querySelectorAll('[data-search-bar] button'),
    ).find((b) => /next/i.test(b.getAttribute('title') ?? '')) as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(
        r.container.querySelector('[data-testid="search-counter"]')?.textContent,
      ).toMatch(/2.*2/);
    });
  });
});
