import {
  actionForCombo,
  comboFromEvent,
  isModifierOnly,
  type AppAction,
} from '@/store/hotkeys';
import {
  toggleFocusMode,
  toggleZenMode,
  toggleGraveyard,
  togglePlotTimeline,
  toggleSpellcheck,
  toggleBlockTypesHelp,
  toggleHotkeysModal,
  toggleCommandPalette,
  uiState,
} from '@/store/ui-state';
import { createChapter } from '@/store/document';

export function runAction(action: AppAction): void {
  switch (action) {
    case 'focus.toggle':      toggleFocusMode();     break;
    case 'zen.toggle':        toggleZenMode();       break;
    case 'graveyard.toggle':  toggleGraveyard();     break;
    case 'timeline.toggle':   togglePlotTimeline();  break;
    case 'spellcheck.toggle': toggleSpellcheck();    break;
    case 'chapter.new':       createChapter();       break;
    case 'help.show':         toggleBlockTypesHelp();break;
    case 'hotkeys.show':      toggleHotkeysModal();  break;
    case 'palette.show':      toggleCommandPalette();break;
  }
}

/**
 * Install the single window-level keydown listener that matches events
 * against the current hotkey bindings and dispatches actions. Intended
 * to be called once at boot.
 */
export function installGlobalHotkeys(): void {
  window.addEventListener('keydown', (e) => {
    // Ignore when a modal is actively capturing key input for rebinding.
    if (document.body.dataset.hotkeyCapture === '1') return;
    if (isModifierOnly(e.key)) return;
    const combo = comboFromEvent(e);
    const action = actionForCombo(combo);
    if (!action) return;
    // Never intercept while the user is typing into a rebind capture
    // field (already handled above) or while the command palette input
    // is focused — Esc/Enter/arrows belong to the palette in that case.
    if (uiState.commandPaletteOpen && (e.key === 'Escape' || e.key === 'Enter')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    runAction(action);
  });
}
