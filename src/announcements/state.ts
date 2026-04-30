/**
 * Per-device acknowledgement / dismissal state for announcements.
 *
 * Two stores:
 *
 *   - `inkmirror.lastSeenAnnouncementInfo` — highest-id of an info
 *     announcement the user has seen. Subsequent boots compare each
 *     incoming info id against this watermark and only surface the
 *     ones above. Same approach as the whats-new badge.
 *
 *   - `inkmirror.acknowledgedCriticals` — explicit set of critical
 *     announcement ids the user has clicked "I understand" on. Critical
 *     announcements re-fire on every boot until acknowledged, so the
 *     watermark approach doesn't apply: if the user reloads to escape
 *     a critical instead of clicking the button, we want it back next
 *     time.
 *
 * Bodies are NEVER stored — only ids. Caching the body would silently
 * show stale text after an operator-side edit.
 */

const KEY_LAST_INFO = 'inkmirror.lastSeenAnnouncementInfo';
const KEY_ACK_CRITICALS = 'inkmirror.acknowledgedCriticals';

export function readLastSeenInfoId(): string | null {
  try {
    return localStorage.getItem(KEY_LAST_INFO);
  } catch {
    return null;
  }
}

/** Bumps the watermark only if the new id sorts higher (lexical). */
export function bumpLastSeenInfoId(id: string): void {
  try {
    const current = localStorage.getItem(KEY_LAST_INFO);
    if (!current || id > current) {
      localStorage.setItem(KEY_LAST_INFO, id);
    }
  } catch {
    // ignore — best effort
  }
}

export function readAcknowledgedCriticals(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_ACK_CRITICALS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function acknowledgeCritical(id: string): void {
  try {
    const current = readAcknowledgedCriticals();
    current.add(id);
    localStorage.setItem(KEY_ACK_CRITICALS, JSON.stringify([...current]));
  } catch {
    // ignore
  }
}

/** Test-only helper. */
export function resetAnnouncementState(): void {
  try {
    localStorage.removeItem(KEY_LAST_INFO);
    localStorage.removeItem(KEY_ACK_CRITICALS);
  } catch {
    // ignore
  }
}
