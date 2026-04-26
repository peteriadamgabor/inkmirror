/**
 * Document store entry point. Owns the AppState shape, the Solid store,
 * and the cross-cutting plumbing — persistence pipeline, hydration,
 * sentiment + inconsistency-flag mutations, viewport/measurement, and
 * document meta + POV. Aggregate-specific mutations live in sibling
 * files and are re-exported here so callers keep using
 * `from '@/store/document'`.
 *
 * - Block CRUD / undo / graveyard → ./document-blocks
 * - Chapter CRUD                  → ./document-chapters
 * - Character CRUD                → ./document-characters
 */

import { createSignal } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type {
  Character,
  Chapter,
  Block,
  Document,
  InconsistencyFlag,
  UUID,
} from '@/types';
import * as repo from '@/db/repository';
import type { LoadedDocument, SentimentEntry } from '@/db/repository';
import type { SyntheticDoc } from '@/engine/synthetic';
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
  /**
   * Which model produced this row.
   * - `'light'` or absent = legacy 3-class distilbert sentiment.
   * - `'deep'` = mDeBERTa mood classification (Near tier).
   */
  source?: 'light' | 'deep';
}

export interface ConsistencyScanProgress {
  processed: number;
  total: number;
  running: boolean;
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
  /** Near tier: inconsistency flags for the active document, keyed by id. */
  inconsistencyFlags: Record<string, InconsistencyFlag>;
  /** Near tier: live progress of an in-flight consistency scan. */
  consistencyScan: ConsistencyScanProgress | null;
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
  inconsistencyFlags: {},
  consistencyScan: null,
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

/** Read-only accessor for sibling modules — kept as a function so they
 * always see the current toggle state, not a snapshot at import time. */
export function canPersist(): boolean {
  return persistEnabled;
}

// ---------- sentiment hook (DI so we avoid a store → ai cycle) ----------

type SentimentHook = (blockId: UUID, text: string) => void;
let sentimentHook: SentimentHook | null = null;

export function setSentimentHook(hook: SentimentHook | null): void {
  sentimentHook = hook;
}

/** Called whenever the active document is replaced (load, hydrate,
 * synthetic load). Lets the AI layer drop per-block analyzer state
 * scoped to the previously-loaded document. */
type DocumentReplacedHook = () => void;
let documentReplacedHook: DocumentReplacedHook | null = null;

export function setDocumentReplacedHook(hook: DocumentReplacedHook | null): void {
  documentReplacedHook = hook;
}

let saveStateTimer: ReturnType<typeof setTimeout> | null = null;

export function track<T>(p: Promise<T>): Promise<T> {
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

export function persistBlockNow(blockId: UUID): void {
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

/** Drop any debounced content write queued for this block. Used by
 * `deleteBlock` to avoid the debounced writer racing with the synchronous
 * row write that follows. */
export function cancelPendingContentWrite(blockId: UUID): void {
  dirtyContentBlocks.delete(blockId);
  const timer = pendingContentTimers.get(blockId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingContentTimers.delete(blockId);
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

export function scheduleBlockContentWrite(blockId: UUID): void {
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
    inconsistencyFlags: {},
    consistencyScan: null,
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
  documentReplacedHook?.();
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
      source: s.source ?? 'light',
    };
  }
  const mentions: Record<UUID, UUID[]> = {};
  for (const b of loaded.blocks) {
    if (!b.content.trim()) continue;
    const ids = findMentions(b.content, loaded.characters);
    if (ids.length > 0) mentions[b.id] = ids;
  }
  const flags: Record<string, InconsistencyFlag> = {};
  for (const f of loaded.inconsistencyFlags) {
    flags[f.id] = f;
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
    inconsistencyFlags: flags,
    consistencyScan: null,
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
  documentReplacedHook?.();
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
      source: sentiment.source,
    };
    track(repo.saveSentiment(store.document.id, entry).catch(() => undefined));
  }
}

// ---------- inconsistency flags ----------

export function setInconsistencyFlag(flag: InconsistencyFlag): void {
  setStore('inconsistencyFlags', flag.id, flag);
  if (persistEnabled) {
    track(repo.saveInconsistencyFlag(unwrap(flag) as InconsistencyFlag).catch(() => undefined));
  }
}

export function removeInconsistencyFlag(id: string): void {
  setStore(
    'inconsistencyFlags',
    produce((map: Record<string, InconsistencyFlag>) => {
      delete map[id];
    }),
  );
  if (persistEnabled) {
    track(repo.deleteInconsistencyFlag(id).catch(() => undefined));
  }
}

export function setInconsistencyFlagStatus(
  id: string,
  status: 'active' | 'dismissed',
): void {
  const existing = store.inconsistencyFlags[id];
  if (!existing) return;
  const next: InconsistencyFlag = {
    ...existing,
    status,
    dismissed_at: status === 'dismissed' ? Date.now() : null,
  };
  setStore('inconsistencyFlags', id, next);
  if (persistEnabled) {
    track(repo.setInconsistencyFlagStatus(id, status).catch(() => undefined));
  }
}

export function replaceInconsistencyFlags(flags: InconsistencyFlag[]): void {
  const map: Record<string, InconsistencyFlag> = {};
  for (const f of flags) map[f.id] = f;
  setStore('inconsistencyFlags', reconcile(map));
}

export function setConsistencyScanProgress(
  progress: ConsistencyScanProgress | null,
): void {
  setStore('consistencyScan', progress);
}

// ---------- viewport + measurements ----------

export function setViewport(scrollTop: number, viewportHeight: number): void {
  setStore('viewport', { scrollTop, viewportHeight });
}

export function setMeasurement(blockId: UUID, measurement: BlockMeasurement): void {
  setStore('measurements', blockId, measurement);
}

// ---------- document meta + POV + active chapter ----------

export function setActiveChapter(chapterId: UUID): void {
  if (!store.chapters.some((c) => c.id === chapterId)) return;
  setStore('activeChapterId', chapterId);
}

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

/**
 * Set (or clear) the document's POV character. Dialogue blocks by this
 * speaker render right-aligned; everyone else stays left-aligned.
 */
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

// ---------- shared helpers used by aggregate modules ----------

export function uuid(): string {
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

// ---------- aggregate re-exports (public API stays at @/store/document) ----------

export {
  type UpdateBlockContentOptions,
  updateBlockContent,
  createBlockAfter,
  createBlockBefore,
  insertPastedParagraphs,
  duplicateBlock,
  performUndo,
  performRedo,
  moveBlockToPosition,
  moveBlock,
  updateBlockType,
  updateDialogueSpeaker,
  updateDialogueParenthetical,
  updateSceneMetadata,
  graveyardBlocks,
  loadBlockRevisions,
  restoreBlockContent,
  refreshGraveyard,
  restoreBlock,
  deleteBlock,
} from './document-blocks';

export {
  createChapter,
  deleteChapter,
  moveChapter,
  renameChapter,
} from './document-chapters';

export {
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from './document-characters';
