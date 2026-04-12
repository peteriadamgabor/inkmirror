import { useTheme } from '@/ui/theme';

export const RightPanel = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col gap-4">
      <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
        Settings
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        class="flex items-center justify-between px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
        aria-label="Toggle theme"
      >
        <span>Theme</span>
        <span class="font-mono text-xs text-stone-500 dark:text-stone-400">
          {theme() === 'dark' ? '🌙 dark' : '☀ light'}
        </span>
      </button>
    </div>
  );
};
