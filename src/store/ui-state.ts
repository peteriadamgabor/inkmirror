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
});

export { uiState };

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

export function toggleGraveyard(): void {
  setUiState('graveyardOpen', (v) => !v);
}

export function setGraveyardOpen(open: boolean): void {
  setUiState('graveyardOpen', open);
}

export function toggleSpellcheck(): void {
  const next = !uiState.spellcheck;
  setUiState('spellcheck', next);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SPELLCHECK_KEY, next ? '1' : '0');
  }
}

export function togglePlotTimeline(): void {
  setUiState('plotTimelineOpen', (v) => !v);
}

export function setPlotTimelineOpen(open: boolean): void {
  setUiState('plotTimelineOpen', open);
}

export function toggleBlockTypesHelp(): void {
  setUiState('blockTypesHelpOpen', (v) => !v);
}

export function setBlockTypesHelpOpen(open: boolean): void {
  setUiState('blockTypesHelpOpen', open);
}

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


export function toggleCommandPalette(): void {
  setUiState('commandPaletteOpen', (v) => !v);
}

export function setCommandPaletteOpen(open: boolean): void {
  setUiState('commandPaletteOpen', open);
}

export function toggleDocumentSettings(): void {
  setUiState('documentSettingsOpen', (v) => !v);
}

export function setDocumentSettingsOpen(open: boolean): void {
  setUiState('documentSettingsOpen', open);
}

export function toggleDebugMode(): void {
  setUiState('debugMode', (v) => !v);
}

export function toggleChapterTypesHelp(): void {
  setUiState('chapterTypesHelpOpen', (v) => !v);
}

export function setChapterTypesHelpOpen(open: boolean): void {
  setUiState('chapterTypesHelpOpen', open);
}

export function toggleSettingsModal(): void {
  setUiState('settingsModalOpen', (v) => !v);
}

export function setSettingsModalOpen(open: boolean): void {
  setUiState('settingsModalOpen', open);
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
