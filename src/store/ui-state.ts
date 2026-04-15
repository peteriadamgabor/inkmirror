import { createStore } from 'solid-js/store';

export interface UiState {
  focusMode: boolean;
  zenMode: boolean;
  graveyardOpen: boolean;
  plotTimelineOpen: boolean;
}

const [uiState, setUiState] = createStore<UiState>({
  focusMode: false,
  zenMode: false,
  graveyardOpen: false,
  plotTimelineOpen: false,
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

export function togglePlotTimeline(): void {
  setUiState('plotTimelineOpen', (v) => !v);
}

export function setPlotTimelineOpen(open: boolean): void {
  setUiState('plotTimelineOpen', open);
}
