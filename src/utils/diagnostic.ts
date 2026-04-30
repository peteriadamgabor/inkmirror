/**
 * Sanitized diagnostic snapshot for the CrashBoundary "copy info" button.
 *
 * The whole point of this surface is that a user can paste it into the
 * feedback form (or a Discord channel) without having to read it line by
 * line first. So: build identity, locale, AI profile, last-active doc id,
 * and the error itself — never the manuscript. No block content, no
 * character names, no document titles, no syncId, no pairing material.
 *
 * Mirrors the `beforeSend`-shaped filter the planned GlitchTip integration
 * will use, so the manual fallback and the automatic path agree on what
 * counts as safe.
 */

import { lang } from '@/i18n';
import { getStoredProfile } from '@/ai/profile';

export interface DiagnosticSnapshot {
  version: string;
  commit: string;
  builtAt: string;
  errorMessage: string;
  errorStack: string | null;
  userAgent: string;
  navigatorLanguage: string;
  appLanguage: string;
  aiProfile: string;
  lastActiveDocId: string | null;
  syncEnabled: boolean;
  capturedAt: string;
}

export interface DiagnosticInputs {
  /** The thrown value caught by the ErrorBoundary. */
  error: unknown;
  /** Last-active document id — id only, never the title. Pass `null` if unknown. */
  lastActiveDocId: string | null;
  /** Whether sync is currently active for this browser. */
  syncEnabled: boolean;
}

export function buildDiagnostic(input: DiagnosticInputs): DiagnosticSnapshot {
  const err = input.error;
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
    commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown',
    builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : 'unknown',
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error && typeof err.stack === 'string' ? err.stack : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    navigatorLanguage: typeof navigator !== 'undefined' ? (navigator.language ?? '') : '',
    appLanguage: lang(),
    aiProfile: safeAiProfile(),
    lastActiveDocId: input.lastActiveDocId,
    syncEnabled: input.syncEnabled,
    capturedAt: new Date().toISOString(),
  };
}

function safeAiProfile(): string {
  // Reading localStorage in this path can throw if the page is in an
  // unusual state (privacy modes, broken globals during a render crash).
  try {
    return getStoredProfile();
  } catch {
    return 'unknown';
  }
}

/**
 * Render the snapshot as a Markdown fenced code block suitable for
 * pasting into the feedback form or a chat. Stable key order so two
 * pastes on the same crash are byte-identical.
 */
export function formatDiagnostic(snap: DiagnosticSnapshot): string {
  const lines: string[] = [
    '```',
    `version:           ${snap.version}`,
    `commit:            ${snap.commit}`,
    `built at:          ${snap.builtAt}`,
    `captured at:       ${snap.capturedAt}`,
    `app language:      ${snap.appLanguage}`,
    `browser language:  ${snap.navigatorLanguage}`,
    `ai profile:        ${snap.aiProfile}`,
    `sync enabled:      ${snap.syncEnabled ? 'yes' : 'no'}`,
    `last document id:  ${snap.lastActiveDocId ?? 'none'}`,
    `user agent:        ${snap.userAgent}`,
    '',
    `error:             ${snap.errorMessage}`,
  ];
  if (snap.errorStack) {
    lines.push('', 'stack:', snap.errorStack);
  }
  lines.push('```');
  return lines.join('\n');
}

/**
 * Best-effort clipboard write. Returns true on success, false on any
 * failure (e.g., permission denied, no Clipboard API). Callers should
 * surface a fallback (textarea-based copy or a "select-all" hint).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
