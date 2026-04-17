import { Show } from 'solid-js';
import { Sidebar } from './layout/Sidebar';
import { Editor } from './layout/Editor';
import { RightPanel } from './layout/RightPanel';
import { DebugOverlay } from './perf/DebugOverlay';
import { Graveyard } from './features/Graveyard';
import { PlotTimeline } from './features/PlotTimeline';
import { BlockTypesHelp } from './features/BlockTypesHelp';
import { ChapterTypesHelp } from './features/ChapterTypesHelp';
import { HotkeysModal } from './features/HotkeysModal';
import { CommandPalette } from './features/CommandPalette';
import { DocumentSettings } from './features/DocumentSettings';
import { ToastHost } from './shared/ToastHost';
import { ConfirmHost } from './shared/ConfirmHost';
import { ContextMenuHost } from './shared/ContextMenuHost';
import { FeedbackHost } from './shared/FeedbackHost';
import {
  uiState,
  toggleFocusMode,
  toggleZenMode,
  toggleRightPanel,
} from '@/store/ui-state';
import { IconChevron } from './shared/icons';
import { t } from '@/i18n';
import type { JSX } from 'solid-js';

export const App = (props: { children?: JSX.Element }) => (
  <div
    class="h-full w-full bg-stone-100 dark:bg-stone-900"
    classList={{
      'inkmirror-zen': uiState.zenMode,
      'inkmirror-focus': uiState.focusMode,
    }}
  >
    <div
      class="h-full w-full grid gap-4 p-4 transition-all duration-300 ease-out min-h-0"
      style={{
        'grid-template-columns': uiState.focusMode
          ? '0fr 1fr 0fr'
          : uiState.rightPanelCollapsed
            ? '260px 1fr 0fr'
            : '260px 1fr 280px',
        'grid-template-rows': 'minmax(0, 1fr)',
      }}
    >
      <div
        class="h-full min-h-0 overflow-hidden transition-opacity duration-200"
        style={{
          opacity: uiState.focusMode ? 0 : 1,
          'pointer-events': uiState.focusMode ? 'none' : 'auto',
        }}
      >
        <Sidebar />
      </div>
      <div
        class="h-full min-h-0 transition-all duration-300"
        style={{
          'max-width': uiState.focusMode ? '860px' : 'none',
          'margin-left': uiState.focusMode ? 'auto' : '0',
          'margin-right': uiState.focusMode ? 'auto' : '0',
          width: '100%',
        }}
      >
        <Editor />
      </div>
      <div
        class="h-full min-h-0 overflow-hidden transition-opacity duration-200"
        style={{
          opacity: uiState.focusMode || uiState.rightPanelCollapsed ? 0 : 1,
          'pointer-events':
            uiState.focusMode || uiState.rightPanelCollapsed ? 'none' : 'auto',
        }}
      >
        <RightPanel />
      </div>
    </div>

    {/* Reveal button — appears only when the right panel is collapsed
        and focus mode is off. Single chevron glyph at the right edge. */}
    <Show when={!uiState.focusMode && uiState.rightPanelCollapsed}>
      <button
        type="button"
        onClick={toggleRightPanel}
        class="fixed top-1/2 -translate-y-1/2 right-3 z-20 w-7 h-12 rounded-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 shadow-sm transition-all hover:shadow-md flex items-center justify-center"
        title={t('topBar.showStoryPanel')}
        aria-label={t('topBar.showStoryPanel')}
      >
        <IconChevron size={14} class="-rotate-90" />
      </button>
    </Show>

    <Show when={uiState.focusMode}>
      <div class="fixed top-4 right-4 z-30 flex gap-2">
        <button
          type="button"
          onClick={toggleZenMode}
          class="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 shadow-sm transition-colors"
        >
          Zen
        </button>
        <button
          type="button"
          onClick={toggleFocusMode}
          class="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 shadow-sm transition-colors"
        >
          {t('sidebar.focus')}
        </button>
      </div>
    </Show>

    <DebugOverlay />
    <Graveyard />
    <PlotTimeline />
    <BlockTypesHelp />
    <ChapterTypesHelp />
    <HotkeysModal />
    <CommandPalette />
    <DocumentSettings />
    <ConfirmHost />
    <ContextMenuHost />
    <FeedbackHost />
    <ToastHost />
    {props.children}
  </div>
);
