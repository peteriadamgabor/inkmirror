import { Show } from 'solid-js';
import { Sidebar } from './layout/Sidebar';
import { Editor } from './layout/Editor';
import { RightPanel } from './layout/RightPanel';
import { FpsOverlay } from './perf/FpsOverlay';
import { Graveyard } from './features/Graveyard';
import { uiState, toggleFocusMode } from '@/store/ui-state';
import type { JSX } from 'solid-js';

export const App = (props: { children?: JSX.Element }) => (
  <div class="h-full w-full bg-stone-100 dark:bg-stone-900">
    <Show
      when={uiState.focusMode}
      fallback={
        <div class="h-full w-full grid grid-cols-[260px_1fr_280px] gap-4 p-4">
          <Sidebar />
          <Editor />
          <RightPanel />
        </div>
      }
    >
      <div class="h-full w-full flex justify-center p-4">
        <div class="w-full max-w-[860px]">
          <Editor />
        </div>
        <button
          type="button"
          onClick={toggleFocusMode}
          class="fixed top-4 right-4 z-30 px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 shadow-sm"
          aria-label="Exit focus mode"
        >
          Exit focus
        </button>
      </div>
    </Show>
    <FpsOverlay />
    <Graveyard />
    {props.children}
  </div>
);
