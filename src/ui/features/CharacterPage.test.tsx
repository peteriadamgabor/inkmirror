import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { CharacterPage } from './CharacterPage';
import {
  createCharacter,
  loadSyntheticDoc,
  setPersistEnabled,
  store,
  updateBlockType,
  updateDialogueSpeaker,
} from '@/store/document';
import { openCharacterPage, closeCharacterPage, uiState } from '@/store/ui-state';
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
      makeBlock('b1', 'ch1', 0, 'Alice walked into the room.'),
      makeBlock('b2', 'ch1', 1, 'She looked around quietly.'),
      makeBlock('b3', 'ch1', 2, 'Hello there.'),
    ],
  };
}

describe('CharacterPage', () => {
  beforeAll(() => setPersistEnabled(false));
  afterAll(() => setPersistEnabled(true));

  beforeEach(() => {
    loadSyntheticDoc(makeDoc());
    closeCharacterPage();
  });

  afterEach(() => {
    closeCharacterPage();
    cleanup();
  });

  it('renders nothing when no character page is open', () => {
    const r = render(() => <CharacterPage />);
    expect(r.container.querySelector('[data-testid="character-page"]')).toBeNull();
  });

  it('renders the character name when opened', async () => {
    const alice = createCharacter('Alice');
    expect(alice).not.toBeNull();
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() => {
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy();
    });
    expect(r.container.textContent).toContain('Alice');
  });

  it('counts mention blocks (the "Alice walked..." line mentions Alice)', async () => {
    const alice = createCharacter('Alice');
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    // The mentions section header + count badge is rendered.
    const section = r.container.querySelector(
      '[data-testid="character-mentions-section"]',
    );
    expect(section).toBeTruthy();
    expect(section?.textContent).toContain('1');
  });

  it('counts dialogue blocks where the character is the speaker', async () => {
    const alice = createCharacter('Alice');
    // Convert b3 to dialogue + assign Alice as speaker.
    updateBlockType('b3', 'dialogue');
    updateDialogueSpeaker('b3', alice!.id);
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    const dialogueSection = r.container.querySelector(
      '[data-testid="character-dialogue-section"]',
    );
    expect(dialogueSection?.textContent).toContain('1');
  });

  it('writing into the description textarea persists to the character store', async () => {
    const alice = createCharacter('Alice');
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    const textarea = r.container.querySelector(
      '[data-testid="character-description"]',
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    fireEvent.input(textarea, { target: { value: 'Curious and brave.' } });
    const updated = store.characters.find((c) => c.id === alice!.id);
    expect(updated?.description).toBe('Curious and brave.');
  });

  it('clicking the backdrop closes the page', async () => {
    const alice = createCharacter('Alice');
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    const backdrop = r.container.querySelector('.inkmirror-modal-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(uiState.characterPageId).toBeNull();
    });
  });

  it('clicking the × button closes the page', async () => {
    const alice = createCharacter('Alice');
    openCharacterPage(alice!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    // The close button has an aria-label routed through t('characterPage.closeLabel').
    const closeBtn = r.container.querySelector(
      '[data-testid="character-page"] button[aria-label]',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(uiState.characterPageId).toBeNull();
    });
  });

  it('renders empty-state copy when the character has no appearances', async () => {
    // Add a character that nothing in the doc references.
    const ghost = createCharacter('Ghost');
    openCharacterPage(ghost!.id);
    const r = render(() => <CharacterPage />);
    await waitFor(() =>
      expect(r.container.querySelector('[data-testid="character-page"]')).toBeTruthy(),
    );
    expect(r.container.textContent).toMatch(/Not in the manuscript|nincs/i);
  });
});
