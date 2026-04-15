import { createStore } from 'solid-js/store';

export interface UiState {
  focusMode: boolean;
  graveyardOpen: boolean;
}

const [uiState, setUiState] = createStore<UiState>({
  focusMode: false,
  graveyardOpen: false,
});

export { uiState };

export function toggleFocusMode(): void {
  setUiState('focusMode', (v) => !v);
}

export function setFocusMode(on: boolean): void {
  setUiState('focusMode', on);
}

export function toggleGraveyard(): void {
  setUiState('graveyardOpen', (v) => !v);
}

export function setGraveyardOpen(open: boolean): void {
  setUiState('graveyardOpen', open);
}
