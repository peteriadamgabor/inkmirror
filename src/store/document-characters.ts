/**
 * Character-aggregate mutations: create / update / delete plus the
 * downstream propagation that keeps the rest of the document
 * consistent — dialogue blocks lose their speaker reference when the
 * referenced character is removed, and the document POV pointer is
 * cleared if it pointed at the deleted character.
 */

import { unwrap } from 'solid-js/store';
import type {
  BlockMetadata,
  Character,
  DialogueMetadata,
  UUID,
} from '@/types';
import * as repo from '@/db/repository';
import {
  canPersist,
  rescanAllCharacterMentions,
  setStore,
  store,
  track,
  uuid,
} from './document';

const DEFAULT_CHARACTER_COLORS = [
  '#7F77DD', // violet-500 (writer)
  '#D85A30', // orange-600 (story)
  '#1D9E75', // teal
  '#378ADD', // blue
  '#D4537E', // pink
  '#639922', // green
];

export function createCharacter(name: string): Character | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!store.document) return null;
  const now = new Date().toISOString();
  const color = DEFAULT_CHARACTER_COLORS[store.characters.length % DEFAULT_CHARACTER_COLORS.length];
  const character: Character = {
    id: uuid(),
    document_id: store.document.id,
    name: trimmed,
    aliases: [],
    notes: '',
    color,
    created_at: now,
    updated_at: now,
  };
  setStore('characters', (cs) => [...cs, character]);
  rescanAllCharacterMentions();

  if (canPersist()) {
    track(repo.saveCharacter(unwrap(character)).catch(() => undefined));
  }
  return character;
}

export function updateCharacter(
  id: UUID,
  patch: Partial<Pick<Character, 'name' | 'notes' | 'color' | 'aliases' | 'description'>>,
): void {
  const idx = store.characters.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  const nameChanged = patch.name !== undefined || patch.aliases !== undefined;
  setStore('characters', idx, (c) => ({
    ...c,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() || c.name : c.name,
    updated_at: now,
  }));
  if (nameChanged) {
    rescanAllCharacterMentions();
    // Dialogue blocks derive their speaker label from the character
    // card on read, so renames are automatic — no propagation needed.
  }

  if (canPersist()) {
    track(repo.saveCharacter(unwrap(store.characters[idx])).catch(() => undefined));
  }
}

export function deleteCharacter(id: UUID): void {
  const idx = store.characters.findIndex((c) => c.id === id);
  if (idx < 0) return;
  setStore('characters', (cs) => cs.filter((c) => c.id !== id));
  rescanAllCharacterMentions();
  propagateCharacterDelete(id);

  // If the deleted character was POV, clear the pointer so no stale UUID
  // is left on the document row.
  if (store.document && store.document.pov_character_id === id) {
    setStore('document', 'pov_character_id', null);
    const doc = unwrap(store.document);
    if (doc) track(repo.saveDocument(doc).catch(() => undefined));
  }

  if (canPersist()) {
    track(repo.deleteCharacter(id).catch(() => undefined));
  }
}

/**
 * When a character is deleted, any dialogue block that referenced them
 * is downgraded to unassigned. The block's content is preserved so the
 * writer loses nothing.
 */
function propagateCharacterDelete(characterId: UUID): void {
  if (!store.document) return;
  const documentId = store.document.id;
  for (const blockId of store.blockOrder) {
    const block = store.blocks[blockId];
    if (!block || block.metadata.type !== 'dialogue') continue;
    const data = block.metadata.data as DialogueMetadata;
    if (data.speaker_id !== characterId) continue;
    const next: BlockMetadata = {
      type: 'dialogue',
      data: {
        speaker_id: '',
        ...(data.parenthetical ? { parenthetical: data.parenthetical } : {}),
      },
    };
    setStore('blocks', blockId, (b) => ({ ...b, metadata: next }));
    if (canPersist()) {
      track(
        repo.saveBlock(unwrap(store.blocks[blockId]), documentId).catch(() => undefined),
      );
    }
  }
}
