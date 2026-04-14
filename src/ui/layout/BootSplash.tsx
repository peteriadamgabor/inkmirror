import { Show } from 'solid-js';

interface BootSplashProps {
  message?: string;
  error?: string;
}

export const BootSplash = (props: BootSplashProps) => {
  return (
    <div class="fixed inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
      <div class="flex flex-col items-center gap-4">
        <div class="text-2xl font-serif text-stone-700 dark:text-stone-200">StoryForge</div>
        <Show
          when={props.error}
          fallback={
            <div class="text-xs text-stone-400">{props.message ?? 'loading…'}</div>
          }
        >
          <div class="flex flex-col items-center gap-2">
            <div class="text-sm text-red-600 dark:text-red-400 max-w-md text-center">
              {props.error}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              class="text-xs px-3 py-1.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200"
            >
              Retry
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};
