/**
 * Operator → user push channel.
 *
 * Strings live INLINE in the JSON (not as i18n keys baked into the
 * bundle) so the operator can edit announcements.json and publish
 * without a redeploy. The whole reason this channel exists is to
 * decouple operator messaging from the release cadence.
 *
 * Per-locale content is best-effort: at least `en` should be present;
 * if the user's language isn't in the announcement, we fall back to
 * English, then to the first available locale key.
 */

export type AnnouncementSeverity = 'info' | 'critical';

/** Locale code matches `src/i18n/index.ts` LANGUAGES entries. */
export type AnnouncementLang = string;

export interface Announcement {
  /**
   * Stable unique id, e.g. "2026-05-03-maintenance". Used for dedup
   * across boots — never reuse an id even if the content is similar.
   */
  id: string;
  severity: AnnouncementSeverity;
  /** Per-locale title. Partial — fall back to en, then first key. */
  title: Partial<Record<AnnouncementLang, string>>;
  /** Per-locale body. Partial — same fallback rules. */
  body: Partial<Record<AnnouncementLang, string>>;
  /**
   * ISO timestamp; if set and in the future, the client ignores the
   * announcement until that time passes. Lets the operator schedule
   * forward-dated drops.
   */
  publishedAt?: string;
  /**
   * ISO timestamp; if set and the time has passed, the announcement is
   * dropped silently. Absence means "one-shot" — show until the user
   * dismisses (info) or acknowledges (critical), then never again.
   */
  expiresAt?: string;
  /**
   * Optional inclusive lower-bound on the running app version. Below
   * this, the announcement is ignored (the user can't usefully act on
   * something their bundle doesn't have yet — let the SW update prompt
   * pull them forward first).
   */
  minVersion?: string;
  /** Optional inclusive upper-bound on the running app version. */
  maxVersion?: string;
  /**
   * Optional "read more" target. If set, surfaced as a link inside the
   * modal/toast.
   */
  link?: string;
}

/** Wire format of `/announcements.json`. */
export interface AnnouncementsPayload {
  /** Schema version — bump if we change the shape. */
  version: 1;
  announcements: Announcement[];
}

export function isAnnouncementsPayload(x: unknown): x is AnnouncementsPayload {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { version?: unknown; announcements?: unknown };
  if (o.version !== 1) return false;
  if (!Array.isArray(o.announcements)) return false;
  return true;
}

export function isAnnouncement(x: unknown): x is Announcement {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return false;
  if (o.severity !== 'info' && o.severity !== 'critical') return false;
  if (typeof o.title !== 'object' || o.title === null) return false;
  if (typeof o.body !== 'object' || o.body === null) return false;
  return true;
}
