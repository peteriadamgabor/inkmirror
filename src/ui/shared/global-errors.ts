/**
 * Global async-error surface. CrashBoundary catches render errors, but
 * unhandled promise rejections (fire-and-forget DB writes, worker
 * failures) and uncaught exceptions in timers/listeners died silently
 * before this — the writer never learned a background save failed.
 *
 * The handler logs the real error for diagnostics and shows one generic,
 * translated toast at most once per TOAST_COOLDOWN_MS so a rejection
 * storm (e.g. IDB quota exceeded firing per pending write) doesn't bury
 * the UI in toasts.
 */

import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

const TOAST_COOLDOWN_MS = 30_000;
let lastToastAt = 0;
let installed = false;

function surface(err: unknown): void {
  // eslint-disable-next-line no-console
  console.error('[inkmirror] unhandled error:', err);
  const now = Date.now();
  if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
  lastToastAt = now;
  try {
    toast.error(t('toast.unexpectedError'));
  } catch {
    // Toast host not mounted yet (boot path) — the console line above
    // is all we can do.
  }
}

export function installGlobalErrorSurface(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('unhandledrejection', (e) => {
    surface(e.reason);
  });
  window.addEventListener('error', (e) => {
    surface(e.error ?? e.message);
  });
}

/** Test hook — reset the singleton guard + toast cooldown. */
export function resetGlobalErrorSurfaceForTests(): void {
  installed = false;
  lastToastAt = 0;
}
