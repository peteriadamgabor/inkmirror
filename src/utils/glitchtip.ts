/**
 * GlitchTip (self-hosted Sentry-protocol) wiring.
 *
 * Off by default. Opt-in via Settings → Privacy → "Send crash reports".
 * The DSN is a public token (it ships in the browser bundle by design)
 * and points at our self-hosted instance — never sentry.io.
 *
 * `beforeSend` reuses the same allow-list as `src/utils/diagnostic.ts`
 * (the CrashBoundary "copy info" button): build identity, locale, AI
 * profile, last-active doc id, error + stack. Manuscript content,
 * character names, document titles, and sync material never leave the
 * browser. We also clear `breadcrumbs`, `user`, `request`, and `extra`
 * because Sentry's defaults include things that could carry typed text
 * (input value breadcrumbs, URL fragments, fetch bodies).
 *
 * The Sentry SDK is dynamically imported only when the toggle is on,
 * so the ~30 KB gzip cost stays out of the main chunk for users who
 * never opt in.
 */

import { lang } from '@/i18n';
import { getStoredProfile } from '@/ai/profile';

export const GLITCHTIP_DSN =
  'https://cae4cf6954864756a6dcd18580f4c8cc@glitchtip.peteriadamgabor.com/1';

const STORAGE_KEY = 'inkmirror.errorReporting';
let initialized = false;

export function isErrorReportingEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setErrorReportingEnabled(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // Storage unavailable — toggle is a no-op for this session.
  }
}

/**
 * Initialise GlitchTip if the user has opted in. Idempotent: safe to
 * call more than once; the SDK is only loaded and configured on the
 * first call. After the first init the toggle requires a reload to
 * actually start/stop sending — surfaced in the Privacy tab UI.
 */
export async function initGlitchTip(): Promise<void> {
  if (initialized) return;
  if (!isErrorReportingEnabled()) return;
  initialized = true;
  try {
    const Sentry = await import('@sentry/browser');
    Sentry.init({
      dsn: GLITCHTIP_DSN,
      release: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
      environment: import.meta.env.MODE,
      sampleRate: 1.0,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Drop the session-tracking integration: GlitchTip doesn't ingest
      // sessions, and shipping per-load session pings is bytes for nothing.
      integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
      beforeSend(event) {
        return sanitize(event);
      },
      beforeBreadcrumb() {
        // Drop all breadcrumbs — typed text and URL params can leak.
        return null;
      },
    });
  } catch {
    initialized = false;
  }
}

interface SentryEventLike {
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  tags?: unknown;
  contexts?: Record<string, unknown>;
}

/**
 * Strip every field that could carry user-authored text and inject the
 * same diagnostic snapshot the CrashBoundary copy-button uses. Keeps
 * `exception` and `message` (error stacks) intact — those are the
 * point of the report.
 */
export function sanitize<T extends SentryEventLike>(event: T): T {
  const safe = buildAppContext();
  const next: SentryEventLike = { ...event };
  next.user = undefined;
  next.request = undefined;
  next.breadcrumbs = undefined;
  next.extra = undefined;
  next.tags = undefined;
  next.contexts = { ...(event.contexts ?? {}), app: safe };
  return next as T;
}

interface AppContext {
  version: string;
  commit: string;
  builtAt: string;
  appLanguage: string;
  navigatorLanguage: string;
  aiProfile: string;
  userAgent: string;
}

function buildAppContext(): AppContext {
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
    commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown',
    builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : 'unknown',
    appLanguage: lang(),
    navigatorLanguage: typeof navigator !== 'undefined' ? (navigator.language ?? '') : '',
    aiProfile: safeAiProfile(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

function safeAiProfile(): string {
  try {
    return getStoredProfile();
  } catch {
    return 'unknown';
  }
}
