import { createSignal } from 'solid-js';
import { LATEST_WHATS_NEW_ID } from '@/i18n/whats-new';

/**
 * "What's new" modal state + the unread badge that drives it.
 *
 * The badge fires when the newest changelog entry id (baked into the
 * bundle at build time) is greater than the id we've persisted as
 * "last seen" for this user. Opening the modal marks everything seen.
 *
 * One-time bootstrap: a brand-new install (no key in localStorage)
 * starts caught up — we don't show a badge to people whose first
 * visit is also "after" every entry was already shipped. They can
 * still open the panel from the trigger button.
 */

const STORAGE_KEY = 'inkmirror.lastSeenChangelog';

function loadLastSeen(): string {
  if (typeof localStorage === 'undefined') return LATEST_WHATS_NEW_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored;
  // First-ever boot: catch the user up silently so we don't badge
  // every shipped feature at them. Subsequent entries trigger the
  // badge because LATEST_WHATS_NEW_ID will move past this value.
  localStorage.setItem(STORAGE_KEY, LATEST_WHATS_NEW_ID);
  return LATEST_WHATS_NEW_ID;
}

const [lastSeen, setLastSeenSignal] = createSignal<string>(loadLastSeen());
const [open, setOpen] = createSignal<boolean>(false);

export const whatsNewOpen = open;

/** True when there's a changelog entry newer than the user's last-seen marker. */
export function hasUnreadWhatsNew(): boolean {
  return LATEST_WHATS_NEW_ID > lastSeen();
}

/** Open the modal and mark everything up to LATEST_WHATS_NEW_ID as seen. */
export function openWhatsNew(): void {
  setOpen(true);
  if (lastSeen() !== LATEST_WHATS_NEW_ID) {
    setLastSeenSignal(LATEST_WHATS_NEW_ID);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, LATEST_WHATS_NEW_ID);
    }
  }
}

export function closeWhatsNew(): void {
  setOpen(false);
}
