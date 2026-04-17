/**
 * Minimal i18n for InkMirror.
 *
 * - Type-safe keys (en.ts is the shape; every other language
 *   must mirror it, enforced at compile time via the `Messages`
 *   type).
 * - One reactive signal for the current language. Components that
 *   call `t(...)` automatically re-render when the signal changes.
 * - localStorage persistence under 'inkmirror.lang'.
 * - Initial language is detected from navigator.language when
 *   nothing is stored yet; unknown locales fall back to English.
 * - Interpolation via {{placeholder}} tokens. No pluralization
 *   library — if we need it for a specific string, Intl.PluralRules
 *   is built into the browser.
 *
 * Adding a new language:
 *   1. Copy `en.ts` to `<lang>.ts`, change the export name.
 *   2. Translate every value, keep every key.
 *   3. Import it here and add it to LANGUAGES below.
 * That's it — the type system forces completeness, and the picker
 * in Document Settings updates automatically.
 */

import { createSignal } from 'solid-js';
import { en, type Messages } from './en';
import { hu } from './hu';

export interface LanguageEntry {
  code: string;
  label: string;
  messages: Messages;
}

export const LANGUAGES: LanguageEntry[] = [
  { code: 'en', label: 'English', messages: en },
  { code: 'hu', label: 'Magyar', messages: hu },
];

const STORAGE_KEY = 'inkmirror.lang';

function detectInitialLang(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator.language?.slice(0, 2).toLowerCase();
    if (nav && LANGUAGES.some((l) => l.code === nav)) return nav;
  }
  return 'en';
}

const [currentLang, setCurrentLang] = createSignal<string>(detectInitialLang());

export const lang = currentLang;

export function setLang(code: string): void {
  if (!LANGUAGES.some((l) => l.code === code)) return;
  setCurrentLang(code);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, code);
  }
}

function messagesFor(code: string): Messages {
  return (LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]).messages;
}

/**
 * Resolve a dot-path key against the current language's messages.
 * Reads `currentLang()` so the returned string updates reactively.
 *
 * @example t('sidebar.focus')
 * @example t('picker.updatedAgo', { ago: '2m' })
 */
export function t(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const msgs = messagesFor(currentLang());
  const parts = key.split('.');
  let node: unknown = msgs;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as object)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      node = undefined;
      break;
    }
  }
  if (typeof node !== 'string') {
    // Graceful degradation: return the key itself so missing
    // translations are visible in the UI instead of exploding.
    return key;
  }
  if (!vars) return node;
  return node.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{{${name}}}`,
  );
}
