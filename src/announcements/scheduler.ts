/**
 * Triggers a fetch on three signals — boot, visibility-change → visible,
 * and a 15-minute interval while the tab is visible. Pause the interval
 * while hidden so we don't burn battery on a backgrounded tab.
 *
 * Idempotent: calling install twice does not double-schedule.
 */

import { fetchAnnouncements } from './client';
import { selectAnnouncements } from './select';
import { setSurfacedAnnouncements } from './store';
import {
  bumpLastSeenInfoId,
  readAcknowledgedCriticals,
  readLastSeenInfoId,
} from './state';
import { lang } from '@/i18n';
import { toast } from '@/ui/shared/toast';
import { pickLocalized } from './localize';

const POLL_INTERVAL_MS = 15 * 60 * 1000;
/** Debounce subsequent visibility-change fetches so a flurry of
 *  focus/blur events doesn't fire repeated requests. */
const VISIBILITY_DEBOUNCE_MS = 5_000;

let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastFetchAt = 0;

interface InstallOptions {
  /** Override the runtime version — used by tests. */
  runningVersion?: string;
  /** Override the JSON URL — used by the preview path. */
  url?: string;
  /** Bypass dedup checks (preview path). */
  bypassDedup?: boolean;
  /** Skip the interval / visibility wiring (one-shot fetch only) — used by
   *  preview path so the operator can see the announcement render once
   *  without lingering polling. */
  oneShot?: boolean;
}

async function tick(opts: InstallOptions): Promise<void> {
  const now = Date.now();
  if (now - lastFetchAt < 1000) return; // hard floor against duplicate calls
  lastFetchAt = now;
  const fetched = await fetchAnnouncements({
    url: opts.url,
    bypassEtag: opts.bypassDedup === true,
  });
  if (!fetched) return;

  const selection = selectAnnouncements({
    list: fetched.payload.announcements,
    runningVersion:
      opts.runningVersion ??
      (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'),
    now: new Date().toISOString(),
    lastSeenInfoId: readLastSeenInfoId(),
    acknowledgedCriticals: readAcknowledgedCriticals(),
    bypassDedup: opts.bypassDedup,
  });

  setSurfacedAnnouncements({
    infos: selection.infos,
    critical: selection.critical,
  });

  // Surface info announcements as toasts. Each toast uses the existing
  // toast surface (with optional action when `link` is set) and bumps
  // the watermark on dismiss so we don't show it again next boot.
  const currentLang = lang();
  for (const a of selection.infos) {
    surfaceInfoToast(a, currentLang);
  }
}

function surfaceInfoToast(
  a: import('./types').Announcement,
  currentLang: string,
): void {
  const title = pickLocalized(a.title, currentLang);
  const body = pickLocalized(a.body, currentLang);
  const message = title && body ? `${title} — ${body}` : title || body;
  if (!message) return;
  // Bumping happens when the toast leaves the active tray (auto-dismiss
  // or explicit close). For now, bump immediately on surface — the user
  // saw it, that's what the watermark records. Re-firing on the next
  // poll within the same session would be annoying, so we also drop
  // it from the pending list once shown.
  bumpLastSeenInfoId(a.id);
  if (a.link) {
    toast.withAction(message, {
      label: '↗',
      handler: () => { window.open(a.link!, '_blank', 'noopener'); },
    });
  } else {
    toast.info(message, 6000);
  }
}

export function installAnnouncementsScheduler(opts: InstallOptions = {}): void {
  if (installed && !opts.oneShot) return;
  installed = !opts.oneShot;

  // Boot fetch — fire immediately.
  void tick(opts);

  if (opts.oneShot) return;

  // Visibility-change → visible refetches with a 5s debounce so a
  // flurry of focus events doesn't hammer the worker.
  let lastVisibilityFetch = 0;
  const onVisibility = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastVisibilityFetch < VISIBILITY_DEBOUNCE_MS) return;
    lastVisibilityFetch = now;
    void tick(opts);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  // Interval — runs only while visible. Recreate when visibility flips
  // so a hidden tab isn't paying the poll cost.
  const armInterval = (): void => {
    if (intervalId !== null) return;
    intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void tick(opts);
    }, POLL_INTERVAL_MS);
  };
  armInterval();
}

/** Test-only / debug. Stops the polling interval but does not clear
 *  the surfaced lists — the UI continues to render whatever's pending. */
export function stopAnnouncementsScheduler(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  installed = false;
}
