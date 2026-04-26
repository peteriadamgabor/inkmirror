import { createStore } from 'solid-js/store';
import type { UUID } from '@/types';

export interface UiState {
  focusMode: boolean;
  zenMode: boolean;
  spellcheck: boolean;
  graveyardOpen: boolean;
  plotTimelineOpen: boolean;
  blockTypesHelpOpen: boolean;
  commandPaletteOpen: boolean;
  documentSettingsOpen: boolean;
  debugMode: boolean;
  rightPanelCollapsed: boolean;
  chapterTypesHelpOpen: boolean;
  settingsModalOpen: boolean;
  settingsModalTab: SettingsModalTab;
  /**
   * Id of the character whose profile page is open, or null when no
   * profile is showing. The CharacterPage host mounts an overlay when
   * this is non-null.
   */
  characterPageId: UUID | null;
  /**
   * In-app search bar — intercepts the browser's native Ctrl+F so the
   * virtualizer-hidden blocks can still be found.
   */
  searchOpen: boolean;
}

export type SettingsModalTab = 'ai' | 'hotkeys' | 'language';

const SPELLCHECK_KEY = 'inkmirror.spellcheck';
const RIGHT_PANEL_KEY = 'inkmirror.rightPanel.collapsed';
const FOCUS_MODE_KEY = 'inkmirror.focusMode';

function loadInitialRightPanelCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(RIGHT_PANEL_KEY) === '1';
}

function loadInitialSpellcheck(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(SPELLCHECK_KEY);
  if (v === null) return true;
  return v === '1';
}

function loadInitialFocusMode(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(FOCUS_MODE_KEY) === '1';
}

function persistFocusMode(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FOCUS_MODE_KEY, on ? '1' : '0');
}

const [uiState, setUiState] = createStore<UiState>({
  focusMode: loadInitialFocusMode(),
  zenMode: false,
  spellcheck: loadInitialSpellcheck(),
  graveyardOpen: false,
  plotTimelineOpen: false,
  blockTypesHelpOpen: false,
  commandPaletteOpen: false,
  documentSettingsOpen: false,
  debugMode: false,
  rightPanelCollapsed: loadInitialRightPanelCollapsed(),
  chapterTypesHelpOpen: false,
  settingsModalOpen: false,
  settingsModalTab: 'ai',
  characterPageId: null,
  searchOpen: false,
});

export { uiState };

/**
 * Keys whose value is `boolean` — the only ones safe for the simple
 * toggle/setter factory below.
 */
type BoolKey = {
  [K in keyof UiState]: UiState[K] extends boolean ? K : never;
}[keyof UiState];

/**
 * Create a `[toggle, setOpen]` pair for any boolean UI flag. Replaces
 * the dozen mechanical pairs that used to hand-roll this.
 *
 * Anything with side effects (persistence, cross-flag implications) keeps
 * its bespoke implementation below — the factory only covers the trivial
 * "flip a boolean in the store" case.
 */
function bool(key: BoolKey): readonly [() => void, (open: boolean) => void] {
  // setUiState's overloads can't infer that `key` narrows the value to
  // boolean; cast at the boundary so callers stay strictly typed.
  const toggle = () => setUiState(key as 'graveyardOpen', (v) => !v);
  const set = (open: boolean) => setUiState(key as 'graveyardOpen', open);
  return [toggle, set] as const;
}

export function toggleFocusMode(): void {
  setUiState('focusMode', (v) => !v);
  persistFocusMode(uiState.focusMode);
  // If focus is being turned off, zen can't survive either.
  if (!uiState.focusMode) setUiState('zenMode', false);
}

export function setFocusMode(on: boolean): void {
  setUiState('focusMode', on);
  persistFocusMode(on);
}

export function toggleZenMode(): void {
  setUiState('zenMode', (v) => !v);
  // Zen implies focus (panels hidden), so flip focus on too.
  if (uiState.zenMode && !uiState.focusMode) {
    setUiState('focusMode', true);
    persistFocusMode(true);
  }
}

export function toggleSpellcheck(): void {
  const next = !uiState.spellcheck;
  setUiState('spellcheck', next);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SPELLCHECK_KEY, next ? '1' : '0');
  }
}

export const [toggleGraveyard, setGraveyardOpen] = bool('graveyardOpen');
export const [togglePlotTimeline, setPlotTimelineOpen] = bool('plotTimelineOpen');
export const [toggleBlockTypesHelp, setBlockTypesHelpOpen] = bool('blockTypesHelpOpen');
export const [toggleCommandPalette, setCommandPaletteOpen] = bool('commandPaletteOpen');
export const [toggleDocumentSettings, setDocumentSettingsOpen] = bool('documentSettingsOpen');
export const [toggleChapterTypesHelp, setChapterTypesHelpOpen] = bool('chapterTypesHelpOpen');
export const [toggleSettingsModal, setSettingsModalOpen] = bool('settingsModalOpen');
export const [toggleSearch, setSearchOpen] = bool('searchOpen');
export const [toggleDebugMode] = bool('debugMode');

/**
 * Legacy alias: pre-Near-tier "Hotkeys modal" now lives as a tab inside
 * Settings. Toggling routes to Settings on the Hotkeys tab.
 */
export function toggleHotkeysModal(): void {
  if (uiState.settingsModalOpen && uiState.settingsModalTab === 'hotkeys') {
    setUiState('settingsModalOpen', false);
    return;
  }
  openSettingsModal('hotkeys');
}

export function openSettingsModal(tab: SettingsModalTab = 'ai'): void {
  setUiState('settingsModalTab', tab);
  setUiState('settingsModalOpen', true);
}

export function setSettingsModalTab(tab: SettingsModalTab): void {
  setUiState('settingsModalTab', tab);
}

export function toggleRightPanel(): void {
  const next = !uiState.rightPanelCollapsed;
  setUiState('rightPanelCollapsed', next);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(RIGHT_PANEL_KEY, next ? '1' : '0');
  }
}

export function openCharacterPage(id: UUID): void {
  setUiState('characterPageId', id);
}

export function closeCharacterPage(): void {
  setUiState('characterPageId', null);
}

// Callback set by index.tsx to navigate back to the document picker.
// Avoids a circular dependency (Sidebar → index → store → Sidebar).
let returnToPickerFn: (() => void) | null = null;

export function setReturnToPicker(fn: () => void): void {
  returnToPickerFn = fn;
}

export function returnToPicker(): void {
  returnToPickerFn?.();
}
