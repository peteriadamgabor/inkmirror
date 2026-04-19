import { t, lang } from '@/i18n';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export interface FullTimestampOptions {
  locale?: string;
  timeZone?: string;
}

export interface EditedTimestampOptions extends FullTimestampOptions {
  now?: number;
}

/**
 * Full date + time, locale-aware. en → "2026-04-17 17:00",
 * hu → "2026. 04. 17. 17:00". Used for "added" (always) and "edited"
 * once the edit is ≥ 7 days old.
 */
export function formatFullTimestamp(iso: string, opts: FullTimestampOptions = {}): string {
  const code = opts.locale ?? lang();
  const tag = code === 'hu' ? 'hu-HU' : 'en-CA';
  const formatted = new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: opts.timeZone,
  }).format(new Date(iso));
  // en-CA yields "2026-04-17, 17:00" — drop the comma for a cleaner line.
  return formatted.replace(', ', ' ');
}

/**
 * Hybrid relative / absolute. < 1 min: just now · < 1 h: Nm ago ·
 * < 24 h: Nh ago · < 7 d: Nd ago · else: full timestamp.
 */
export function formatEditedTimestamp(iso: string, opts: EditedTimestampOptions = {}): string {
  const now = opts.now ?? Date.now();
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return t('time.justNow');
  if (diff < HOUR) return t('time.minutesAgo', { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('time.hoursAgo', { n: Math.floor(diff / HOUR) });
  if (diff < WEEK) return t('time.daysAgo', { n: Math.floor(diff / DAY) });
  return formatFullTimestamp(iso, { locale: opts.locale, timeZone: opts.timeZone });
}
