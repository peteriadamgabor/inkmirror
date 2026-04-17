import { createSignal } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import type { Block, BlockType, BlockMetadata, Chapter, ChapterKind, Character, DialogueMetadata, Document, Mark, SceneMetadata, UUID } from '@/types';
import { normalizeMarks } from '@/engine/marks';
import {
  trackContentChange,
  finalizePendingBatch,
  pushEntry,
  popUndo,
  popRedo,
  markExternalBlockChange,
  type UndoEntry,
} from './undo';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { BlockRevision, LoadedDocument, SentimentEntry } from '@/db/repository';
import * as repo from '@/db/repository';
import { findMentions } from '@/engine/character-matcher';

export interface ViewportState {
  scrollTop: number;
  viewportHeight: number;
}

export interface BlockMeasurement {
  height: number;
  contentHash: string;
}

export interface BlockSentiment {
  label: string;
  score: number;
  contentHash: string;
  analyzedAt: string;
}

export interface AppState {
  document: Document | null;
  chapters: Chapter[];
  blocks: Record<UUID, Block>;
  blockOrder: UUID[];
  activeChapterId: UUID | null;
  measurements: Record<UUID, BlockMeasurement>;
  sentiments: Record<UUID, BlockSentiment>;
  characters: Character[];
  /** Derived: block id → character ids mentioned in that block. */
  characterMentions: Record<UUID, UUID[]>;
  viewport: ViewportState;
}

const initialState: AppState = {
  document: null,
  chapters: [],
  blocks: {},
  blockOrder: [],
  activeChapterId: null,
  measurements: {},
  sentiments: {},
  characters: [],
  characterMentions: {},
  viewport: { scrollTop: 0, viewportHeight: 0 },
};

export const [store, setStore] = createStore<AppState>(initialState);

// Reactive save-state indicator. Updated by the persistence plumbing
// so the UI can show "Saving..." / "Saved".
const [saveState, setSaveState] = createSignal<'idle' | 'saving' | 'saved'>('idle');
export { saveState };

// ---------- persistence plumbing ----------

const CONTENT_DEBOUNCE_MS = 500;
let persistEnabled = true;
const pendingWrites = new Set<Promise<unknown>>();
const pendingContentTimers = new Map<UUID, ReturnType<typeof setTimeout>>();
const dirtyContentBlocks = new Set<UUID>();

export function setPersistEnabled(enabled: boolean): void {
  persistEnabled = enabled;
}

// ---------- sentiment hook (DI so we avoid a store → ai cycle) ----------

type SentimentHook = (blockId: UUID, text: string) => void;
let sentimentHook: SentimentHook | null = null;

export function setSentimentHook(hook: SentimentHook | null): void {
  sentimentHook = hook;
}

let saveStateTimer: ReturnType<typeof setTimeout> | null = null;

function track<T>(p: Promise<T>): Promise<T> {
  pendingWrites.add(p);
  setSaveState('saving');
  if (saveStateTimer) clearTimeout(saveStateTimer);
  p.finally(() => {
    pendingWrites.delete(p);
    if (pendingWrites.size === 0) {
      setSaveState('saved');
      saveStateTimer = setTimeout(() => setSaveState('idle'), 2000);
    }
  });
  return p;
}

function persistBlockNow(blockId: UUID): void {
  dirtyContentBlocks.delete(blockId);
  const timer = pendingContentTimers.get(blockId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingContentTimers.delete(blockId);
  }
  if (!persistEnabled) return;
  const documentId = store.document?.id;
  const block = store.blocks[blockId];
  if (!documentId || !block) return;
  track(repo.saveBlock(unwrap(block), documentId).catch(() => undefined));
  // Snapshot a revision on every persistence pulse. The repo layer dedups
  // identical content so no-op commits don't bloat history.
  if (block.content.trim().length > 0) {
    track(
      repo
        .saveRevision({
          blockId,
          documentId,
          content: block.content,
          snapshotAt: block.updated_at,
        })
        .catch(() => undefined),
    );
  }
  rescanBlockMentions(blockId);
  if (sentimentHook && block.content.trim().length > 0) {
    sentimentHook(blockId, block.content);
  }
}

export function rescanBlockMentions(blockId: UUID): void {
  const block = store.blocks[blockId];
  if (!block) return;
  if (store.characters.length === 0 || !block.content.trim()) {
    if (store.characterMentions[blockId]?.length) {
      setStore('characterMentions', blockId, []);
    }
    return;
  }
  const ids = findMentions(block.content, unwrap(store.characters));
  setStore('characterMentions', blockId, ids);
}

export function rescanAllCharacterMentions(): void {
  const mentions: Record<UUID, UUID[]> = {};
  const chars = unwrap(store.characters);
  for (const id of store.blockOrder) {
    const block = store.blocks[id];
    if (!block || !block.content.trim()) continue;
    const found = findMentions(block.content, chars);
    if (found.length > 0) mentions[id] = found;
  }
  // reconcile replaces the whole subtree; plain setStore would merge and
  // leave stale block ids behind after a character is deleted.
  setStore('characterMentions', reconcile(mentions));
}

function scheduleBlockContentWrite(blockId: UUID): void {
  if (!persistEnabled) return;
  dirtyContentBlocks.add(blockId);
  const existing = pendingContentTimers.get(blockId);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingContentTimers.delete(blockId);
    persistBlockNow(blockId);
  }, CONTENT_DEBOUNCE_MS);
  pendingContentTimers.set(blockId, timer);
}

export async function flushPendingWrites(timeoutMs = 200): Promise<void> {
  for (const blockId of [...dirtyContentBlocks]) {
    persistBlockNow(blockId);
  }
  if (pendingWrites.size === 0) return;
  await Promise.race([
    Promise.allSettled([...pendingWrites]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

// ---------- hydration ----------

export function loadSyntheticDoc(doc: SyntheticDoc): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of doc.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  setStore({
    document: doc.document,
    chapters: doc.chapters,
    blocks,
    blockOrder,
    activeChapterId: doc.chapters[0]?.id ?? null,
    measurements: {},
    sentiments: {},
    characters: [],
    characterMentions: {},
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}

export function hydrateFromLoaded(loaded: LoadedDocument): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of loaded.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  const sentiments: Record<UUID, BlockSentiment> = {};
  for (const s of loaded.sentiments) {
    sentiments[s.blockId] = {
      label: s.label,
      score: s.score,
      contentHash: s.contentHash,
      analyzedAt: s.analyzedAt,
    };
  }
  const mentions: Record<UUID, UUID[]> = {};
  for (const b of loaded.blocks) {
    if (!b.content.trim()) continue;
    const ids = findMentions(b.content, loaded.characters);
    if (ids.length > 0) mentions[b.id] = ids;
  }
  setStore({
    document: loaded.document,
    chapters: loaded.chapters,
    blocks,
    blockOrder,
    activeChapterId: loaded.chapters[0]?.id ?? null,
    measurements: {},
    sentiments,
    characters: loaded.characters,
    characterMentions: mentions,
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}

export function setSentiment(blockId: UUID, sentiment: BlockSentiment): void {
  setStore('sentiments', blockId, sentiment);
  if (persistEnabled && store.document) {
    const entry: SentimentEntry = {
      blockId,
      label: sentiment.label,
      score: sentiment.score,
      contentHash: sentiment.contentHash,
      analyzedAt: sentiment.analyzedAt,
    };
    track(repo.saveSentiment(store.document.id, entry).catch(() => undefined));
  }
}

// ---------- viewport + measurements ----------

export function setViewport(scrollTop: number, viewportHeight: number): void {
  setStore('viewport', { scrollTop, viewportHeight });
}

export function setMeasurement(blockId: UUID, measurement: BlockMeasurement): void {
  setStore('measurements', blockId, measurement);
}

// ---------- mutations ----------

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Match a leading "Name:" pattern against existing characters. Returns the
 * matched character and the rest of the content with the prefix stripped,
 * or null if nothing matches.
 *
 * The pattern accepts up to three words before the colon (to allow "John
 * the Baker" but not an entire sentence) and requires the name to match a
 * character's main name or one of their aliases, case-insensitively.
 */
export function matchLeadingSpeaker(
  content: string,
  characters: readonly Character[],
): { character: Character; rest: string } | null {
  if (!content) return null;
  const match = /^([^\n:]{1,40}):\s*/.exec(content);
  if (!match) return null;
  const prefix = match[1].trim();
  // Require prefix to look like a name — no lowercase-only single words,
  // no leading punctuation, reasonable length.
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]{0,40}$/.test(prefix)) return null;
  const key = prefix.toLowerCase();
  for (const c of characters) {
    if (c.name.toLowerCase() === key) {
      return { character: c, rest: content.slice(match[0].length) };
    }
    for (const alias of c.aliases) {
      if (alias.toLowerCase() === key) {
        return { character: c, rest: content.slice(match[0].length) };
      }
    }
  }
  return null;
}

export interface UpdateBlockContentOptions {
  /**
   * Run the dialogue leading-"Name:" auto-detect. Only callers that know
   * the block is at an idle commit point (blur, type conversion) should
   * pass this, because auto-detect can strip the content prefix — and
   * doing that while the contenteditable is focused would desync the
   * DOM from the store.
   */
  detectSpeaker?: boolean;
  /**
   * Inline formatting ranges read from the DOM. When provided, replaces
   * the block's marks in full. Pass an empty array to clear. Omit to
   * leave marks untouched.
   */
  marks?: Mark[];
}

export function updateBlockContent(
  blockId: UUID,
  content: string,
  opts: UpdateBlockContentOptions = {},
): void {
  const existing = store.blocks[blockId];
  if (!existing) return;

  // Track for undo before mutating.
  trackContentChange(blockId, existing.content, existing.marks ? [...existing.marks] : undefined);

  const now = new Date().toISOString();
  let nextContent = content;
  let nextMetadata: BlockMetadata | null = null;

  if (
    opts.detectSpeaker &&
    existing.metadata.type === 'dialogue' &&
    !(existing.metadata.data as DialogueMetadata).speaker_id
  ) {
    const match = matchLeadingSpeaker(content, unwrap(store.characters));
    if (match) {
      nextContent = match.rest;
      nextMetadata = {
        type: 'dialogue',
        data: {
          speaker_id: match.character.id,
          ...(existing.metadata.data.parenthetical
            ? { parenthetical: existing.metadata.data.parenthetical }
            : {}),
        },
      };
    }
  }

  let nextMarks: Mark[] | undefined = undefined;
  if (opts.marks !== undefined) {
    const normalized = normalizeMarks(opts.marks, nextContent.length);
    nextMarks = normalized.length > 0 ? normalized : undefined;
  }

  setStore('blocks', blockId, (b) => {
    const out: Block = {
      ...b,
      content: nextContent,
      metadata: nextMetadata ?? b.metadata,
      updated_at: now,
    };
    if (opts.marks !== undefined) {
      if (nextMarks) out.marks = nextMarks;
      else delete out.marks;
    }
    return out;
  });
  scheduleBlockContentWrite(blockId);
}

export function createBlockAfter(blockId: UUID, type: BlockType = 'text'): UUID {
  const existing = store.blocks[blockId];
  if (!existing) throw new Error(`createBlockAfter: unknown block ${blockId}`);

  const newId = uuid();
  const now = new Date().toISOString();
  const newBlock: Block = {
    id: newId,
    chapter_id: existing.chapter_id,
    type,
    content: '',
    order: existing.order + 1,
    metadata: defaultMetadataFor(type),
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };

  const idx = store.blockOrder.indexOf(blockId);
  const newOrder = [...store.blockOrder];
  newOrder.splice(idx + 1, 0, newId);

  setStore('blocks', newId, newBlock);
  setStore('blockOrder', newOrder);

  if (persistEnabled && store.document) {
    track(repo.saveBlock(unwrap(newBlock), store.document.id).catch(() => undefined));
  }

  return newId;
}

/**
 * Insert a chunk of text that contains paragraph breaks (\n\n+) into the
 * current block, splitting into multiple blocks so each pasted paragraph
 * lands in its own block. Respects the caret position inside the current
 * block — the text before the caret stays, the first pasted paragraph is
 * appended, subsequent paragraphs become new blocks, and any text that
 * was after the caret ends up at the tail of the last new block.
 *
 * Returns the id of the block the caret should land in, and the offset
 * within it.
 */
export function insertPastedParagraphs(
  blockId: UUID,
  caretOffset: number,
  text: string,
): { targetBlockId: UUID; caretOffset: number } {
  const block = store.blocks[blockId];
  if (!block) return { targetBlockId: blockId, caretOffset };
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\r/g, ''))
    .filter((p) => p.length > 0);
  if (paragraphs.length <= 1) {
    // Falls back to simple in-place insertion by the caller.
    return { targetBlockId: blockId, caretOffset };
  }
  const head = block.content.slice(0, caretOffset);
  const tail = block.content.slice(caretOffset);

  // First paragraph joins the existing head.
  const firstContent = head + paragraphs[0];
  updateBlockContent(blockId, firstContent);

  let previousId = blockId;
  // Middle paragraphs each become their own block.
  for (let i = 1; i < paragraphs.length - 1; i++) {
    const newId = createBlockAfter(previousId);
    updateBlockContent(newId, paragraphs[i]);
    previousId = newId;
  }
  // Last paragraph gets the pre-paste tail appended to it.
  const lastText = paragraphs[paragraphs.length - 1] + tail;
  const lastId = createBlockAfter(previousId);
  updateBlockContent(lastId, lastText);
  return {
    targetBlockId: lastId,
    caretOffset: paragraphs[paragraphs.length - 1].length,
  };
}

/**
 * Duplicate a block: creates a sibling immediately after the original
 * with identical type, content, and metadata. Returns the new block id.
 */
export function duplicateBlock(blockId: UUID): UUID | null {
  const source = store.blocks[blockId];
  if (!source) return null;
  const newId = createBlockAfter(blockId);
  const now = new Date().toISOString();
  setStore('blocks', newId, (b) => ({
    ...b,
    type: source.type,
    content: source.content,
    metadata: source.metadata,
    updated_at: now,
  }));
  if (persistEnabled && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[newId]), store.document.id)
        .catch(() => undefined),
    );
  }
  return newId;
}

// ---------- undo / redo ----------

function applyUndoEntry(entry: UndoEntry, isRedo: boolean): void {
  switch (entry.kind) {
    case 'content-change': {
      const state = isRedo ? entry.after : entry.before;
      const block = store.blocks[entry.blockId];
      if (!block) return;
      const now = new Date().toISOString();
      setStore('blocks', entry.blockId, (b) => {
        const out: Block = { ...b, content: state.content, updated_at: now };
        if (state.marks && state.marks.length > 0) out.marks = state.marks;
        else delete out.marks;
        return out;
      });
      // Force-sync the (possibly focused) contenteditable DOM. Without
      // this pulse the BlockView effect would skip the write because
      // focus is still on the block from before Ctrl+Z.
      markExternalBlockChange(entry.blockId);
      if (persistEnabled && store.document) {
        track(
          repo
            .saveBlock(unwrap(store.blocks[entry.blockId]), store.document.id)
            .catch(() => undefined),
        );
      }
      break;
    }
    case 'block-delete': {
      if (isRedo) {
        // Re-delete: same as the original deleteBlock but skip pushing undo again.
        deleteBlock(entry.block.id, true);
      } else {
        // Restore: re-insert the block at its original position.
        const restored: Block = {
          ...entry.block,
          deleted_at: null,
          deleted_from: null,
          updated_at: new Date().toISOString(),
        };
        setStore('blocks', restored.id, restored);
        const newOrder = [...store.blockOrder];
        const insertAt = Math.min(entry.orderIndex, newOrder.length);
        newOrder.splice(insertAt, 0, restored.id);
        setStore('blockOrder', newOrder);
        if (persistEnabled) {
          track(
            repo
              .saveBlock(unwrap(store.blocks[restored.id]), entry.documentId)
              .catch(() => undefined),
          );
        }
      }
      break;
    }
    case 'type-change': {
      const state = isRedo ? entry.after : entry.before;
      const block = store.blocks[entry.blockId];
      if (!block) return;
      const now = new Date().toISOString();
      setStore('blocks', entry.blockId, (b) => ({
        ...b,
        type: state.type,
        metadata: state.metadata,
        content: state.content,
        updated_at: now,
      }));
      markExternalBlockChange(entry.blockId);
      if (persistEnabled && store.document) {
        track(
          repo
            .saveBlock(unwrap(store.blocks[entry.blockId]), store.document.id)
            .catch(() => undefined),
        );
      }
      break;
    }
    case 'block-move': {
      const fromIdx = isRedo ? entry.toIndex : entry.fromIndex;
      const toIdx = isRedo ? entry.fromIndex : entry.toIndex;
      void fromIdx;
      // Just swap back — moveBlockToPosition handles the full reorder.
      moveBlockToPosition(entry.blockId, isRedo ? entry.toIndex : entry.fromIndex);
      void toIdx;
      break;
    }
  }
}

export function performUndo(): boolean {
  // Finalize any pending content batch so the current text is captured.
  if (store.blockOrder.length > 0) {
    const activeEl = document.activeElement as HTMLElement | null;
    const blockId = activeEl?.closest('[data-block-id]')?.getAttribute('data-block-id');
    if (blockId && store.blocks[blockId]) {
      finalizePendingBatch(
        blockId,
        store.blocks[blockId].content,
        store.blocks[blockId].marks,
      );
    }
  }
  const entry = popUndo();
  if (!entry) return false;
  applyUndoEntry(entry, false);
  return true;
}

export function performRedo(): boolean {
  const entry = popRedo();
  if (!entry) return false;
  applyUndoEntry(entry, true);
  return true;
}

export function setActiveChapter(chapterId: UUID): void {
  if (!store.chapters.some((c) => c.id === chapterId)) return;
  setStore('activeChapterId', chapterId);
}

const CHAPTER_KIND_DEFAULTS: Record<ChapterKind, { title: string; content: string }> = {
  standard:        { title: '',                content: '' },
  cover:           { title: 'Cover',           content: '' },
  dedication:      { title: 'Dedication',      content: 'For …' },
  epigraph:        { title: 'Epigraph',        content: '"…"\n\n— Author' },
  acknowledgments: { title: 'Acknowledgments', content: 'Thanks to …' },
  afterword:       { title: 'Afterword',       content: '' },
};

export function createChapter(
  kind: ChapterKind = 'standard',
): { chapterId: UUID; blockId: UUID } | null {
  if (!store.document) return null;
  const now = new Date().toISOString();
  const chapterId = uuid();
  const blockId = uuid();
  const existingCount = store.chapters.length;
  const defaults = CHAPTER_KIND_DEFAULTS[kind];
  const title =
    kind === 'standard' ? `Chapter ${existingCount + 1}` : defaults.title;
  const chapter: Chapter = {
    id: chapterId,
    document_id: store.document.id,
    title,
    order: existingCount,
    kind,
    created_at: now,
    updated_at: now,
  };
  const block: Block = {
    id: blockId,
    chapter_id: chapterId,
    type: 'text',
    content: defaults.content,
    order: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };
  setStore('chapters', (chs) => [...chs, chapter]);
  setStore('blocks', blockId, block);
  setStore('blockOrder', (order) => [...order, blockId]);
  setStore('activeChapterId', chapterId);

  if (persistEnabled && store.document) {
    const documentId = store.document.id;
    track(repo.saveChapter(unwrap(chapter)).catch(() => undefined));
    track(repo.saveBlock(unwrap(block), documentId).catch(() => undefined));
  }

  return { chapterId, blockId };
}

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

  if (persistEnabled) {
    track(repo.saveCharacter(unwrap(character)).catch(() => undefined));
  }
  return character;
}

export function updateCharacter(
  id: UUID,
  patch: Partial<Pick<Character, 'name' | 'notes' | 'color' | 'aliases'>>,
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

  if (persistEnabled) {
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

  if (persistEnabled) {
    track(repo.deleteCharacter(id).catch(() => undefined));
  }
}

/**
 * Set (or clear) the document's POV character. Dialogue blocks by this
 * speaker render right-aligned; everyone else stays left-aligned.
 */
/**
 * Patch one or more user-visible Document fields (title, author,
 * synopsis). Keeps the Document row in sync with the settings modal
 * and persists immediately.
 */
export function updateDocumentMeta(
  patch: Partial<Pick<Document, 'title' | 'author' | 'synopsis'>>,
): void {
  if (!store.document) return;
  const now = new Date().toISOString();
  setStore('document', (d) => (d ? { ...d, ...patch, updated_at: now } : d));
  if (persistEnabled) {
    const doc = unwrap(store.document);
    if (doc) track(repo.saveDocument(doc).catch(() => undefined));
  }
}

/**
 * Patch one or more editor-visual settings (font family, theme, etc.).
 * Kept separate from updateDocumentMeta so the two can be reasoned
 * about independently — meta changes rarely, settings often.
 */
export function updateDocumentSettings(
  patch: Partial<Document['settings']>,
): void {
  if (!store.document) return;
  const now = new Date().toISOString();
  setStore('document', (d) =>
    d ? { ...d, settings: { ...d.settings, ...patch }, updated_at: now } : d,
  );
  if (persistEnabled) {
    const doc = unwrap(store.document);
    if (doc) track(repo.saveDocument(doc).catch(() => undefined));
  }
}

export function setPovCharacter(characterId: UUID | null): void {
  if (!store.document) return;
  if (characterId !== null && !store.characters.some((c) => c.id === characterId)) {
    return;
  }
  const now = new Date().toISOString();
  setStore('document', (d) =>
    d ? { ...d, pov_character_id: characterId, updated_at: now } : d,
  );
  if (persistEnabled) {
    const doc = unwrap(store.document);
    if (doc) track(repo.saveDocument(doc).catch(() => undefined));
  }
}

/**
 * Delete a chapter: hard-remove the chapter row and soft-delete every
 * block that belonged to it (blocks go to the graveyard carrying a
 * deleted_from trail, so the user can restore individual blocks later).
 * Refuses to delete the last chapter — there must always be at least one.
 */
export function deleteChapter(chapterId: UUID): boolean {
  if (store.chapters.length <= 1) return false;
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter) return false;

  const doomedBlockIds = store.blockOrder.filter(
    (id) => store.blocks[id]?.chapter_id === chapterId,
  );
  const now = new Date().toISOString();

  // Soft-delete each block with a deleted_from trail so the graveyard
  // entry remembers which chapter it came from (even after the chapter
  // row itself disappears).
  for (const blockId of doomedBlockIds) {
    const block = store.blocks[blockId];
    if (!block) continue;
    const deletedFrom: NonNullable<Block['deleted_from']> = {
      chapter_id: chapterId,
      chapter_title: chapter.title,
      position: store.blockOrder.indexOf(blockId),
    };
    setStore('blocks', blockId, (b) => ({
      ...b,
      deleted_at: now,
      deleted_from: deletedFrom,
      updated_at: now,
    }));
    if (persistEnabled && store.document) {
      track(
        repo
          .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
          .catch(() => undefined),
      );
    }
  }

  setStore(
    'blockOrder',
    store.blockOrder.filter((id) => !doomedBlockIds.includes(id)),
  );

  // Remove the chapter from the store and the active pointer.
  const remaining = store.chapters.filter((c) => c.id !== chapterId);
  setStore('chapters', remaining);
  if (store.activeChapterId === chapterId) {
    const fallback = remaining[0]?.id ?? null;
    setStore('activeChapterId', fallback);
  }

  if (persistEnabled) {
    track(repo.deleteChapterRow(chapterId).catch(() => undefined));
  }
  return true;
}

export function moveChapter(chapterId: UUID, direction: 'up' | 'down'): boolean {
  const idx = store.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return false;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= store.chapters.length) return false;

  const now = new Date().toISOString();
  const chapters = store.chapters.slice();
  const temp = chapters[idx];
  chapters[idx] = chapters[swapIdx];
  chapters[swapIdx] = temp;

  // Rewrite order fields.
  chapters.forEach((c, i) => {
    if (c.order !== i) {
      setStore('chapters', i, (ch) => ({ ...ch, order: i, updated_at: now }));
    }
  });
  setStore('chapters', chapters);

  if (persistEnabled) {
    for (const c of [chapters[idx], chapters[swapIdx]]) {
      track(repo.saveChapter(unwrap(c)).catch(() => undefined));
    }
  }
  return true;
}

export function renameChapter(chapterId: UUID, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  const idx = store.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return;
  const now = new Date().toISOString();
  setStore('chapters', idx, (c) => ({ ...c, title: trimmed, updated_at: now }));

  if (persistEnabled) {
    const chapter = store.chapters[idx];
    track(repo.saveChapter(unwrap(chapter)).catch(() => undefined));
  }
}

/**
 * Move a block to an arbitrary target position in the blockOrder array.
 * Used by drag-and-drop reordering. The target index is in the space of
 * the CURRENT blockOrder — i.e. pass the index the dragged block should
 * end up at in the final array. Same-chapter constraint enforced: drops
 * into a different chapter are rejected (we just realign to the nearest
 * same-chapter index to avoid silent chapter reassignment).
 */
export function moveBlockToPosition(blockId: UUID, targetIndex: number): boolean {
  const order = store.blockOrder;
  const sourceIdx = order.indexOf(blockId);
  if (sourceIdx < 0) return false;
  if (targetIndex === sourceIdx || targetIndex === sourceIdx + 1) return false;

  const current = store.blocks[blockId];
  if (!current) return false;

  // Build the new order: remove source, insert at target.
  const newOrder = order.slice();
  const [moved] = newOrder.splice(sourceIdx, 1);
  // If the source came before the target, the removal shifted everything
  // left by one, so the target index needs to shift too.
  const adjusted = targetIndex > sourceIdx ? targetIndex - 1 : targetIndex;
  newOrder.splice(adjusted, 0, moved);

  // Cross-chapter check: the dropped block must land between or at the
  // edges of same-chapter blocks. If it would land between blocks from
  // different chapters, snap to the nearest same-chapter boundary.
  const beforeId = newOrder[adjusted - 1];
  const afterId = newOrder[adjusted + 1];
  const beforeBlock = beforeId ? store.blocks[beforeId] : null;
  const afterBlock = afterId ? store.blocks[afterId] : null;
  const beforeChapter = beforeBlock?.chapter_id;
  const afterChapter = afterBlock?.chapter_id;
  if (
    (beforeChapter && beforeChapter !== current.chapter_id) &&
    (afterChapter && afterChapter !== current.chapter_id)
  ) {
    return false;
  }

  setStore('blockOrder', newOrder);

  // Rewrite `order` fields for every block in the source block's chapter
  // so loadDocument rehydrates in the right sequence after reload.
  const now = new Date().toISOString();
  const chapterId = current.chapter_id;
  let orderIdx = 0;
  const documentId = store.document?.id;
  for (const id of newOrder) {
    const b = store.blocks[id];
    if (!b || b.chapter_id !== chapterId) continue;
    if (b.order !== orderIdx) {
      setStore('blocks', id, (old) => ({ ...old, order: orderIdx, updated_at: now }));
      if (persistEnabled && documentId) {
        track(repo.saveBlock(unwrap(store.blocks[id]), documentId).catch(() => undefined));
      }
    }
    orderIdx++;
  }
  return true;
}

export function moveBlock(blockId: UUID, direction: 'up' | 'down'): boolean {
  const current = store.blocks[blockId];
  if (!current) return false;
  const order = store.blockOrder;
  const idx = order.indexOf(blockId);
  if (idx < 0) return false;

  // Find the nearest neighbor in the same chapter in the requested direction.
  const step = direction === 'up' ? -1 : 1;
  let neighborIdx = idx + step;
  while (
    neighborIdx >= 0 &&
    neighborIdx < order.length &&
    store.blocks[order[neighborIdx]]?.chapter_id !== current.chapter_id
  ) {
    neighborIdx += step;
  }
  if (neighborIdx < 0 || neighborIdx >= order.length) return false;
  if (store.blocks[order[neighborIdx]]?.chapter_id !== current.chapter_id) return false;

  const neighborId = order[neighborIdx];
  const neighbor = store.blocks[neighborId];
  if (!neighbor) return false;

  const newOrder = order.slice();
  newOrder[idx] = neighborId;
  newOrder[neighborIdx] = blockId;
  setStore('blockOrder', newOrder);

  // Swap the persisted `order` field so loadDocument rehydrates in the
  // correct sequence after reload.
  const now = new Date().toISOString();
  const currentOrderValue = current.order;
  const neighborOrderValue = neighbor.order;
  setStore('blocks', blockId, (b) => ({ ...b, order: neighborOrderValue, updated_at: now }));
  setStore('blocks', neighborId, (b) => ({ ...b, order: currentOrderValue, updated_at: now }));

  if (persistEnabled && store.document) {
    const documentId = store.document.id;
    track(repo.saveBlock(unwrap(store.blocks[blockId]), documentId).catch(() => undefined));
    track(repo.saveBlock(unwrap(store.blocks[neighborId]), documentId).catch(() => undefined));
  }

  return true;
}

function defaultMetadataFor(type: BlockType): BlockMetadata {
  switch (type) {
    case 'text':     return { type: 'text' };
    case 'dialogue': return { type: 'dialogue', data: { speaker_id: '' } };
    case 'scene':    return { type: 'scene', data: { location: '', time: '', character_ids: [], mood: '' } };
    case 'note':     return { type: 'note', data: {} };
  }
}

export function updateBlockType(blockId: UUID, type: BlockType): void {
  const block = store.blocks[blockId];
  if (!block || block.type === type) return;

  // Snapshot for undo before mutating.
  finalizePendingBatch(blockId, block.content, block.marks);
  const beforeState = {
    type: block.type,
    metadata: { ...unwrap(block.metadata) } as BlockMetadata,
    content: block.content,
  };

  const now = new Date().toISOString();
  let metadata = defaultMetadataFor(type);
  let content = block.content;

  // Converting to dialogue is an idle commit point — try to auto-detect a
  // leading "Name:" prefix so the writer who typed "Alice: Hello" and then
  // switched the block type gets the speaker populated for free.
  if (type === 'dialogue') {
    const match = matchLeadingSpeaker(content, unwrap(store.characters));
    if (match) {
      content = match.rest;
      metadata = {
        type: 'dialogue',
        data: { speaker_id: match.character.id },
      };
    }
  }

  setStore('blocks', blockId, (b) => ({
    ...b,
    type,
    metadata,
    content,
    updated_at: now,
  }));

  pushEntry({
    kind: 'type-change',
    blockId,
    before: beforeState,
    after: { type, metadata, content },
  });

  if (persistEnabled && store.document) {
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}

/**
 * Assign or clear the speaker on a dialogue block. Pass `null` to unassign.
 * No-op for blocks that aren't of type dialogue.
 */
export function updateDialogueSpeaker(
  blockId: UUID,
  characterId: UUID | null,
): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'dialogue') return;
  const now = new Date().toISOString();
  const existingParenthetical = block.metadata.data.parenthetical;
  const next: BlockMetadata = {
    type: 'dialogue',
    data: {
      speaker_id: characterId ?? '',
      ...(existingParenthetical ? { parenthetical: existingParenthetical } : {}),
    },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (persistEnabled && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
        .catch(() => undefined),
    );
  }
}

export function updateDialogueParenthetical(
  blockId: UUID,
  parenthetical: string,
): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'dialogue') return;
  const now = new Date().toISOString();
  const trimmed = parenthetical.trim();
  const next: BlockMetadata = {
    type: 'dialogue',
    data: {
      speaker_id: block.metadata.data.speaker_id,
      ...(trimmed ? { parenthetical: trimmed } : {}),
    },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (persistEnabled && store.document) {
    track(
      repo
        .saveBlock(unwrap(store.blocks[blockId]), store.document.id)
        .catch(() => undefined),
    );
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
    if (persistEnabled) {
      track(
        repo.saveBlock(unwrap(store.blocks[blockId]), documentId).catch(() => undefined),
      );
    }
  }
}

export function updateSceneMetadata(blockId: UUID, patch: Partial<SceneMetadata>): void {
  const block = store.blocks[blockId];
  if (!block || block.metadata.type !== 'scene') return;
  const now = new Date().toISOString();
  const next: BlockMetadata = {
    type: 'scene',
    data: { ...block.metadata.data, ...patch },
  };
  setStore('blocks', blockId, (b) => ({ ...b, metadata: next, updated_at: now }));
  if (persistEnabled && store.document) {
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}

// ---------- graveyard ----------

const [graveyard, setGraveyard] = createSignal<Block[]>([]);

export const graveyardBlocks = graveyard;

// ---------- per-block revision history ----------

export async function loadBlockRevisions(blockId: UUID): Promise<BlockRevision[]> {
  try {
    return await repo.loadRevisions(blockId);
  } catch {
    return [];
  }
}

export function restoreBlockContent(blockId: UUID, content: string): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const now = new Date().toISOString();
  setStore('blocks', blockId, (b) => ({ ...b, content, updated_at: now }));
  // Persist immediately — don't debounce — so the restored content is safe.
  persistBlockNow(blockId);
  // Place caret at the end of the restored content so the writer can
  // keep typing without guessing where the cursor went.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-block-id="${blockId}"] [data-editable]`,
    );
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

async function recoverLastNonEmpty(blockId: UUID): Promise<string | null> {
  const revs = await repo.loadRevisions(blockId);
  const latest = revs.find((r) => r.content.trim().length > 0);
  return latest?.content ?? null;
}

export async function refreshGraveyard(): Promise<void> {
  if (!store.document) return;
  try {
    const rows = await repo.loadDeletedBlocks(store.document.id);
    // Blocks are typically deleted only after their content was backspaced
    // to empty, so the row itself is empty. Join with the revision store
    // to surface the last non-empty version for display.
    const enriched = await Promise.all(
      rows.map(async (b) => {
        if (b.content.trim().length > 0) return b;
        const recovered = await recoverLastNonEmpty(b.id);
        return recovered ? { ...b, content: recovered } : b;
      }),
    );
    setGraveyard(enriched);
  } catch {
    /* swallow — non-critical */
  }
}

export async function restoreBlock(blockId: UUID): Promise<void> {
  if (!store.document) return;
  const documentId = store.document.id;
  const restored = await repo.restoreBlock(blockId, documentId);
  if (!restored) return;
  // If the stored row is empty (the usual case — deleted_at flipped after
  // the user had already backspaced the text), recover the last non-empty
  // revision so the user gets their writing back, not an empty shell.
  let content = restored.content;
  if (content.trim().length === 0) {
    const recovered = await recoverLastNonEmpty(blockId);
    if (recovered) content = recovered;
  }
  // Attach to its original chapter if it still exists, else to the active one.
  const chapterId =
    store.chapters.some((c) => c.id === restored.chapter_id)
      ? restored.chapter_id
      : store.activeChapterId ?? store.chapters[0]?.id;
  if (!chapterId) return;
  const rehydrated: Block = {
    ...restored,
    chapter_id: chapterId,
    content,
    deleted_at: null,
    deleted_from: null,
  };
  setStore('blocks', rehydrated.id, rehydrated);
  setStore('blockOrder', (order) => [...order, rehydrated.id]);
  // Persist the enriched row back so reloads see the recovered content.
  track(repo.saveBlock(unwrap(store.blocks[rehydrated.id]), documentId).catch(() => undefined));
  await refreshGraveyard();
}

export function deleteBlock(blockId: UUID, skipUndo = false): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const chapter = store.chapters.find((c) => c.id === block.chapter_id);
  const position = store.blockOrder.indexOf(blockId);

  // Finalize any pending content batch for this block before deleting.
  finalizePendingBatch(blockId, block.content, block.marks);
  if (!skipUndo && store.document) {
    pushEntry({
      kind: 'block-delete',
      block: { ...unwrap(block) },
      orderIndex: position,
      documentId: store.document.id,
    });
  }
  const now = new Date().toISOString();
  const deletedFrom: NonNullable<Block['deleted_from']> = {
    chapter_id: block.chapter_id,
    chapter_title: chapter?.title ?? '',
    position,
  };
  setStore(
    'blockOrder',
    store.blockOrder.filter((id) => id !== blockId),
  );
  setStore('blocks', blockId, (b) => ({
    ...b,
    deleted_at: now,
    deleted_from: deletedFrom,
    updated_at: now,
  }));

  if (persistEnabled && store.document) {
    // Cancel any pending debounced content write — we're about to persist
    // the full row below, so the debounced write would only race with it.
    dirtyContentBlocks.delete(blockId);
    const timer = pendingContentTimers.get(blockId);
    if (timer !== undefined) {
      clearTimeout(timer);
      pendingContentTimers.delete(blockId);
    }
    // Write content + deleted_at in one op so the graveyard preserves
    // whatever the user typed right up to the moment of deletion.
    track(repo.saveBlock(unwrap(store.blocks[blockId]), store.document.id).catch(() => undefined));
  }
}
