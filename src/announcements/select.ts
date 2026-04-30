/**
 * Pure selection logic — given the raw announcements list and the
 * current device state, return what to actually surface to the user.
 *
 * Defensive caps live here:
 *   - Max 1 critical modal per boot (chained-acknowledge feels awful;
 *     surface only the highest-id unacknowledged critical, queue the
 *     rest for the next boot).
 *   - Max 3 info toasts per boot (the rest go straight to the toast
 *     history popover).
 *
 * Filters live here:
 *   - publishedAt in the future → hide
 *   - expiresAt in the past     → drop entirely
 *   - minVersion / maxVersion   → must match running version
 *   - id <= lastSeenInfoId      → already seen (info only)
 *   - acknowledgedCriticals     → already cleared (critical only)
 */

import type { Announcement } from './types';
import { meetsVersionGate } from './version';

export interface SelectionInputs {
  list: Announcement[];
  /** Current running version — usually `__APP_VERSION__`. */
  runningVersion: string;
  /** ISO "now"; injectable for tests. */
  now: string;
  lastSeenInfoId: string | null;
  acknowledgedCriticals: Set<string>;
  /** Bypass dedup checks. Used by the preview path so the operator
   *  can see the announcement render even if they "saw it" already. */
  bypassDedup?: boolean;
}

export interface Selection {
  /** Up to MAX_INFO entries, sorted by id descending. */
  infos: Announcement[];
  /** Single critical to display, or null. */
  critical: Announcement | null;
}

const MAX_INFO_PER_BOOT = 3;

export function selectAnnouncements(input: SelectionInputs): Selection {
  const now = new Date(input.now).getTime();
  const filtered: Announcement[] = [];
  for (const a of input.list) {
    if (a.publishedAt) {
      const t = new Date(a.publishedAt).getTime();
      if (Number.isFinite(t) && t > now) continue;
    }
    if (a.expiresAt) {
      const t = new Date(a.expiresAt).getTime();
      if (Number.isFinite(t) && t <= now) continue;
    }
    if (!meetsVersionGate(input.runningVersion, a.minVersion, a.maxVersion)) {
      continue;
    }
    filtered.push(a);
  }

  // Sort by id descending — ids are date-shaped, so this is "newest first".
  filtered.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));

  // Critical: highest-id unacknowledged.
  let critical: Announcement | null = null;
  if (!input.bypassDedup) {
    for (const a of filtered) {
      if (a.severity !== 'critical') continue;
      if (input.acknowledgedCriticals.has(a.id)) continue;
      critical = a;
      break;
    }
  } else {
    critical = filtered.find((a) => a.severity === 'critical') ?? null;
  }

  // Info: highest-id first that the watermark hasn't already cleared,
  // capped at MAX_INFO_PER_BOOT. With bypassDedup, take the top N
  // regardless of watermark.
  const infos: Announcement[] = [];
  for (const a of filtered) {
    if (a.severity !== 'info') continue;
    if (!input.bypassDedup && input.lastSeenInfoId && a.id <= input.lastSeenInfoId) {
      continue;
    }
    infos.push(a);
    if (infos.length >= MAX_INFO_PER_BOOT) break;
  }

  return { infos, critical };
}
