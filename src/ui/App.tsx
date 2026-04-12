import { Sidebar } from './layout/Sidebar';
import { Editor } from './layout/Editor';
import { RightPanel } from './layout/RightPanel';
import { FpsOverlay } from './perf/FpsOverlay';
import type { JSX } from 'solid-js';

export const App = (props: { children?: JSX.Element }) => (
  <div class="h-full w-full grid grid-cols-[260px_1fr_280px] gap-4 p-4 bg-stone-100 dark:bg-stone-900">
    <Sidebar />
    <Editor />
    <RightPanel />
    <FpsOverlay />
    {props.children}
  </div>
);
