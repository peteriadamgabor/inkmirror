import { createSignal, onMount } from 'solid-js';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'inkmirror-theme';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const [themeSignal, setThemeSignal] = createSignal<Theme>(initialTheme());

function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', t === 'dark');
}

function setTheme(t: Theme): void {
  setThemeSignal(t);
  applyTheme(t);
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* private mode */
  }
}

function toggleTheme(): void {
  setTheme(themeSignal() === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  onMount(() => applyTheme(themeSignal()));
  return {
    theme: themeSignal,
    setTheme,
    toggleTheme,
  };
}
