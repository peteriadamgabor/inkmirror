import { Show } from 'solid-js';
import { Sidebar } from './layout/Sidebar';
import { Editor } from './layout/Editor';
import { RightPanel } from './layout/RightPanel';
import { FpsOverlay } from './perf/FpsOverlay';
import { Graveyard } from './features/Graveyard';
import { PlotTimeline } from './features/PlotTimeline';
import { uiState, toggleFocusMode, toggleZenMode } from '@/store/ui-state';
import type { JSX } from 'solid-js';

export const App = (props: { children?: JSX.Element }) => (
  <div
    class="h-full w-full bg-stone-100 dark:bg-stone-900"
    classList={{
      'storyforge-zen': uiState.zenMode,
      'storyforge-focus': uiState.focusMode,
    }}
  >
    <div class="h-full w-full grid gap-4 p-4 transition-all duration-300 ease-out"
      style={{
        'grid-template-columns': uiState.focusMode ? '0fr 1fr 0fr' : '260px 1fr 280px',
      }}
    >
      <div
        class="overflow-hidden transition-opacity duration-200"
        style={{
          opacity: uiState.focusMode ? 0 : 1,
          'pointer-events': uiState.focusMode ? 'none' : 'auto',
        }}
      >
        <Sidebar />
      </div>
      <div
        class="transition-all duration-300"
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
        class="overflow-hidden transition-opacity duration-200"
        style={{
          opacity: uiState.focusMode ? 0 : 1,
          'pointer-events': uiState.focusMode ? 'none' : 'auto',
        }}
      >
        <RightPanel />
      </div>
    </div>

    <Show when={uiState.focusMode}>
      <div class="fixed top-4 right-4 z-30 flex gap-2">
        <button
          type="button"
          onClick={toggleZenMode}
          class="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 shadow-sm transition-colors"
        >
          {uiState.zenMode ? 'Exit zen' : 'Zen'}
        </button>
        <button
          type="button"
          onClick={toggleFocusMode}
          class="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 shadow-sm transition-colors"
        >
          Exit focus
        </button>
      </div>
    </Show>

    <FpsOverlay />
    <Graveyard />
    <PlotTimeline />
    {props.children}
  </div>
);
