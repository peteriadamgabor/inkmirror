import { createStore } from 'solid-js/store';

/**
 * App-wide rebindable actions. Kept intentionally separate from the
 * per-block editor keybindings in src/ui/blocks/keybindings.ts, which
 * are caret-aware and don't fit the global rebindable model.
 */
export type AppAction =
  | 'focus.toggle'
  | 'zen.toggle'
  | 'graveyard.toggle'
  | 'timeline.toggle'
  | 'spellcheck.toggle'
  | 'chapter.new'
  | 'help.show'
  | 'hotkeys.show'
  | 'palette.show'
  | 'search.toggle'
  | 'document.settings'
  | 'undo'
  | 'redo'
  | 'debug.toggle';

export interface BindingMeta {
  action: AppAction;
  /** i18n key under `hotkeys.appLabels.*` — resolved via `t()` at render. */
  labelKey: string;
  /** i18n key under `hotkeys.appDescriptions.*` — resolved via `t()` at render. */
  descriptionKey: string;
  defaultCombo: string;
}

export const BINDING_META: BindingMeta[] = [
  { action: 'palette.show',       labelKey: 'hotkeys.appLabels.palette',          descriptionKey: 'hotkeys.appDescriptions.palette',          defaultCombo: 'Ctrl+K' },
  { action: 'search.toggle',      labelKey: 'hotkeys.appLabels.search',           descriptionKey: 'hotkeys.appDescriptions.search',           defaultCombo: 'Ctrl+F' },
  { action: 'hotkeys.show',       labelKey: 'hotkeys.appLabels.hotkeys',          descriptionKey: 'hotkeys.appDescriptions.hotkeys',          defaultCombo: 'F1' },
  { action: 'help.show',          labelKey: 'hotkeys.appLabels.blockTypesHelp',   descriptionKey: 'hotkeys.appDescriptions.blockTypesHelp',   defaultCombo: 'Alt+Shift+?' },
  { action: 'focus.toggle',       labelKey: 'hotkeys.appLabels.focusMode',        descriptionKey: 'hotkeys.appDescriptions.focusMode',        defaultCombo: 'Alt+Shift+F' },
  { action: 'zen.toggle',         labelKey: 'hotkeys.appLabels.zenMode',          descriptionKey: 'hotkeys.appDescriptions.zenMode',          defaultCombo: 'Alt+Shift+Z' },
  { action: 'graveyard.toggle',   labelKey: 'hotkeys.appLabels.graveyard',        descriptionKey: 'hotkeys.appDescriptions.graveyard',        defaultCombo: 'Alt+Shift+G' },
  { action: 'timeline.toggle',    labelKey: 'hotkeys.appLabels.plotTimeline',     descriptionKey: 'hotkeys.appDescriptions.plotTimeline',     defaultCombo: 'Alt+Shift+L' },
  { action: 'chapter.new',        labelKey: 'hotkeys.appLabels.newChapter',       descriptionKey: 'hotkeys.appDescriptions.newChapter',       defaultCombo: 'Alt+Shift+N' },
  { action: 'spellcheck.toggle',  labelKey: 'hotkeys.appLabels.spellcheck',       descriptionKey: 'hotkeys.appDescriptions.spellcheck',       defaultCombo: 'Alt+Shift+K' },
  { action: 'document.settings', labelKey: 'hotkeys.appLabels.documentSettings', descriptionKey: 'hotkeys.appDescriptions.documentSettings', defaultCombo: 'Alt+Shift+D' },
  { action: 'undo',               labelKey: 'hotkeys.appLabels.undo',             descriptionKey: 'hotkeys.appDescriptions.undo',             defaultCombo: 'Ctrl+Z' },
  { action: 'redo',               labelKey: 'hotkeys.appLabels.redo',             descriptionKey: 'hotkeys.appDescriptions.redo',             defaultCombo: 'Ctrl+Shift+Z' },
  { action: 'debug.toggle',       labelKey: 'hotkeys.appLabels.debugPanel',       descriptionKey: 'hotkeys.appDescriptions.debugPanel',       defaultCombo: 'Alt+Shift+`' },
];

const STORAGE_KEY = 'inkmirror.hotkeys';

function defaultsMap(): Record<AppAction, string> {
  const out = {} as Record<AppAction, string>;
  for (const m of BINDING_META) out[m.action] = m.defaultCombo;
  return out;
}

function loadBindings(): Record<AppAction, string> {
  const defaults = defaultsMap();
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<AppAction, string>>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function persist(state: Record<AppAction, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded is not fatal */
  }
}

const [hotkeys, setHotkeysStore] = createStore<Record<AppAction, string>>(
  loadBindings(),
);
export { hotkeys };

export function setHotkey(action: AppAction, combo: string): void {
  setHotkeysStore(action, combo);
  persist({ ...hotkeys });
}

export function resetHotkeys(): void {
  const defaults = defaultsMap();
  for (const action of Object.keys(defaults) as AppAction[]) {
    setHotkeysStore(action, defaults[action]);
  }
  persist(defaults);
}

/**
 * Normalize a KeyboardEvent into a stable "Ctrl+Alt+Shift+Meta+Key"
 * combo string. Modifier order is fixed so comparisons are O(1) string
 * equality.
 */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  let key = e.key;
  if (key === ' ') key = 'Space';
  if (key === 'Escape') key = 'Esc';
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

export function isModifierOnly(key: string): boolean {
  return (
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Shift' ||
    key === 'Meta' ||
    key === 'OS'
  );
}

/** Look up the action for a given combo, or null if none is bound. */
export function actionForCombo(combo: string): AppAction | null {
  // Cmd on macOS produces Meta+, while the defaults ship as Ctrl+. Accept
  // either prefix so users don't have to rebind on a different OS.
  const candidates = [combo];
  if (combo.startsWith('Meta+')) candidates.push('Ctrl+' + combo.slice(5));
  if (combo.startsWith('Ctrl+')) candidates.push('Meta+' + combo.slice(5));
  for (const m of BINDING_META) {
    const bound = hotkeys[m.action];
    if (candidates.includes(bound)) return m.action;
  }
  return null;
}
