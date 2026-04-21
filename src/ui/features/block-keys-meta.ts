/**
 * Read-only reference for block-level keybindings. These are the
 * caret-aware keys handled by `src/ui/blocks/keybindings.ts` — they
 * aren't in the rebindable hotkey store, but still deserve a place
 * in the Settings panel so users can discover them.
 *
 * Keep this list in sync when adding or removing intents.
 */

export type BlockKeySection = 'blocks' | 'movement' | 'formatting';

export interface BlockKeyMeta {
  section: BlockKeySection;
  combo: string;
  labelKey: string;
}

export const BLOCK_KEY_META: BlockKeyMeta[] = [
  // Block creation & type
  { section: 'blocks', combo: 'Enter',            labelKey: 'hotkeys.descriptions.newBlock' },
  { section: 'blocks', combo: 'Ctrl+Shift+Enter', labelKey: 'hotkeys.descriptions.insertAbove' },
  { section: 'blocks', combo: '/',                labelKey: 'hotkeys.descriptions.slashMenu' },
  { section: 'blocks', combo: 'Alt+1',            labelKey: 'hotkeys.descriptions.typeText' },
  { section: 'blocks', combo: 'Alt+2',            labelKey: 'hotkeys.descriptions.typeDialogue' },
  { section: 'blocks', combo: 'Alt+3',            labelKey: 'hotkeys.descriptions.typeScene' },
  { section: 'blocks', combo: 'Alt+4',            labelKey: 'hotkeys.descriptions.typeNote' },
  { section: 'blocks', combo: 'Ctrl+D',           labelKey: 'hotkeys.descriptions.duplicateBlock' },
  { section: 'blocks', combo: 'Ctrl+Shift+K',     labelKey: 'hotkeys.descriptions.deleteBlock' },
  { section: 'blocks', combo: 'Backspace',        labelKey: 'hotkeys.descriptions.deleteEmpty' },

  // Movement & navigation
  { section: 'movement', combo: 'Alt+↑',           labelKey: 'hotkeys.descriptions.moveUp' },
  { section: 'movement', combo: 'Alt+↓',           labelKey: 'hotkeys.descriptions.moveDown' },
  { section: 'movement', combo: '↑',               labelKey: 'hotkeys.descriptions.focusPrev' },
  { section: 'movement', combo: '↓',               labelKey: 'hotkeys.descriptions.focusNext' },
  { section: 'movement', combo: 'Tab / Shift+Tab', labelKey: 'hotkeys.descriptions.cycleSpeaker' },

  // Formatting
  { section: 'formatting', combo: 'Ctrl+B', labelKey: 'hotkeys.descriptions.bold' },
  { section: 'formatting', combo: 'Ctrl+I', labelKey: 'hotkeys.descriptions.italic' },
];

export const BLOCK_KEY_SECTION_ORDER: BlockKeySection[] = [
  'blocks',
  'movement',
  'formatting',
];
