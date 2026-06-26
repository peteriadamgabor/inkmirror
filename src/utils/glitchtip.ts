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
 *
 * Reverse-proxy auth: GlitchTip sits behind a NetBird auth proxy that
 * blocks unauthenticated access. We can't pass that proxy from the
 * browser — a custom auth header on a cross-origin POST triggers a CORS
 * preflight, and browsers never attach custom headers to a preflight, so
 * the proxy 401s it before the real request fires. Instead the SDK runs
 * with `tunnel: '/glitchtip-tunnel'`: envelopes POST to that same-origin
 * Worker route, which injects the NetBird secret server-side (see
 * src/worker/glitchtip-tunnel.ts). The secret never ships in the bundle.
 */

import { lang } from '@/i18n';
import { getStoredProfile } from '@/ai/profile';

/**
 * DSN resolution order:
 *   1. `VITE_GLITCHTIP_DSN` — set on the Cloudflare Pages project so the
 *      ingest target can be repointed (e.g. server reinstall) without a
 *      code change. Public token by design; ships in the bundle.
 *   2. Hardcoded fallback below — keeps local/dev builds and any build
 *      without the env var pointed at the current self-hosted instance.
 */
export const GLITCHTIP_DSN =
  import.meta.env.VITE_GLITCHTIP_DSN ||
  'https://1dc5441f4fcd4bff8aaff4e290be16d4@glitchtip.peteriadamgabor.com/1';

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
      // Route every envelope through our same-origin Worker, which adds the
      // NetBird auth header server-side. Avoids the CORS preflight that makes
      // a browser-set auth header impossible. See the file header.
      tunnel: '/glitchtip-tunnel',
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
