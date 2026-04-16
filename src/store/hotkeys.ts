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
  | 'document.settings'
  | 'undo'
  | 'redo';

export interface BindingMeta {
  action: AppAction;
  label: string;
  description: string;
  defaultCombo: string;
}

export const BINDING_META: BindingMeta[] = [
  { action: 'palette.show',      label: 'Command palette',     description: 'Search every action by name',           defaultCombo: 'Ctrl+K' },
  { action: 'hotkeys.show',      label: 'Hotkey settings',     description: 'Open the hotkey settings modal',        defaultCombo: 'F1' },
  { action: 'help.show',         label: 'Block types help',    description: 'What text / dialogue / scene / note do',defaultCombo: 'Alt+Shift+?' },
  { action: 'focus.toggle',      label: 'Focus mode',          description: 'Hide side panels, dim other blocks',    defaultCombo: 'Alt+Shift+F' },
  { action: 'zen.toggle',        label: 'Zen mode',            description: 'Strip block chrome — just prose',       defaultCombo: 'Alt+Shift+Z' },
  { action: 'graveyard.toggle',  label: 'Dead text graveyard', description: 'Review and restore deleted blocks',     defaultCombo: 'Alt+Shift+G' },
  { action: 'timeline.toggle',   label: 'Plot timeline',       description: 'Scene timeline grouped by chapter',     defaultCombo: 'Alt+Shift+L' },
  { action: 'chapter.new',       label: 'New chapter',         description: 'Create a standard chapter',             defaultCombo: 'Alt+Shift+N' },
  { action: 'spellcheck.toggle', label: 'Spellcheck',          description: 'Toggle browser red-squiggle spellcheck',defaultCombo: 'Alt+Shift+K' },
  { action: 'document.settings',label: 'Document settings',   description: 'Edit title, author, synopsis',          defaultCombo: 'Alt+Shift+D' },
  { action: 'undo',              label: 'Undo',               description: 'Undo the last action',                  defaultCombo: 'Ctrl+Z' },
  { action: 'redo',              label: 'Redo',               description: 'Redo the last undone action',            defaultCombo: 'Ctrl+Shift+Z' },
];

const STORAGE_KEY = 'storyforge.hotkeys';

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
