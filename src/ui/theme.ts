import { createSignal, onMount } from 'solid-js';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'storyforge-theme';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const [theme, setThemeSignal] = createSignal<Theme>(initialTheme());

function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', t === 'dark');
}

export function useTheme() {
  onMount(() => applyTheme(theme()));
  return {
    theme,
    setTheme(t: Theme) {
      setThemeSignal(t);
      applyTheme(t);
      try { localStorage.setItem(STORAGE_KEY, t); } catch { /* private mode */ }
    },
    toggleTheme() {
      const next: Theme = theme() === 'dark' ? 'light' : 'dark';
      this.setTheme(next);
    },
  };
}
