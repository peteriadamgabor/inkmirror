import { createStore } from 'solid-js/store';

export interface UiState {
  focusMode: boolean;
  zenMode: boolean;
  spellcheck: boolean;
  graveyardOpen: boolean;
  plotTimelineOpen: boolean;
  blockTypesHelpOpen: boolean;
}

const SPELLCHECK_KEY = 'storyforge.spellcheck';

function loadInitialSpellcheck(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(SPELLCHECK_KEY);
  if (v === null) return true;
  return v === '1';
}

const [uiState, setUiState] = createStore<UiState>({
  focusMode: false,
  zenMode: false,
  spellcheck: loadInitialSpellcheck(),
  graveyardOpen: false,
  plotTimelineOpen: false,
  blockTypesHelpOpen: false,
});

export { uiState };

export function toggleFocusMode(): void {
  setUiState('focusMode', (v) => !v);
  // If focus is being turned off, zen can't survive either.
  if (!uiState.focusMode) setUiState('zenMode', false);
}

export function setFocusMode(on: boolean): void {
  setUiState('focusMode', on);
}

export function toggleZenMode(): void {
  setUiState('zenMode', (v) => !v);
  // Zen implies focus (panels hidden), so flip focus on too.
  if (uiState.zenMode) setUiState('focusMode', true);
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
