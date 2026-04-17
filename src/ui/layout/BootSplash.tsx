import { Show } from 'solid-js';

interface BootSplashProps {
  message?: string;
  error?: string;
}

export const BootSplash = (props: BootSplashProps) => {
  return (
    <div class="fixed inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-900 inkmirror-paper">
      <div class="flex flex-col items-center gap-4">
        <div class="relative">
          <div class="text-3xl font-serif text-stone-700 dark:text-stone-200 tracking-tight">
            InkMirror
          </div>
          <div
            class="text-3xl font-serif tracking-tight select-none pointer-events-none text-violet-300 inkmirror-mirror-breath absolute left-0 right-0 top-full"
            style={{
              'mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 85%)',
              '-webkit-mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 85%)',
              'line-height': '1',
              filter: 'blur(0.5px)',
            }}
            aria-hidden="true"
          >
            InkMirror
          </div>
        </div>
        <Show
          when={props.error}
          fallback={
            <div class="text-xs text-stone-400 mt-4">
              {props.message ?? 'opening the manuscript…'}
            </div>
          }
        >
          <div class="flex flex-col items-center gap-3 mt-4 max-w-md">
            <div class="text-sm text-stone-600 dark:text-stone-300 text-center font-serif">
              The app couldn't open your library.
            </div>
            <div class="text-xs text-red-600 dark:text-red-400 text-center break-words">
              {props.error}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              class="text-xs px-4 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
            >
              Try again
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};
