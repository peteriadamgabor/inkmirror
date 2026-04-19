import { describe, it, expect } from 'vitest';
import { formatFullTimestamp, formatEditedTimestamp } from './block-timestamp';

describe('formatFullTimestamp', () => {
  it('formats ISO-like for en', () => {
    expect(formatFullTimestamp('2026-04-17T17:00:00Z', { locale: 'en', timeZone: 'UTC' })).toBe(
      '2026-04-17 17:00',
    );
  });

  it('formats Hungarian style for hu', () => {
    expect(formatFullTimestamp('2026-04-17T17:00:00Z', { locale: 'hu', timeZone: 'UTC' })).toBe(
      '2026. 04. 17. 17:00',
    );
  });
});

describe('formatEditedTimestamp', () => {
  const NOW = new Date('2026-04-19T12:00:00Z').getTime();

  it('returns "just now" within the first minute', () => {
    expect(formatEditedTimestamp('2026-04-19T11:59:30Z', { now: NOW })).toBe('just now');
  });

  it('returns minutes-ago under an hour', () => {
    expect(formatEditedTimestamp('2026-04-19T11:55:00Z', { now: NOW })).toBe('5m ago');
    expect(formatEditedTimestamp('2026-04-19T11:01:00Z', { now: NOW })).toBe('59m ago');
  });

  it('returns hours-ago under a day', () => {
    expect(formatEditedTimestamp('2026-04-19T10:00:00Z', { now: NOW })).toBe('2h ago');
    expect(formatEditedTimestamp('2026-04-18T13:00:00Z', { now: NOW })).toBe('23h ago');
  });

  it('returns days-ago under a week', () => {
    expect(formatEditedTimestamp('2026-04-18T12:00:00Z', { now: NOW })).toBe('1d ago');
    expect(formatEditedTimestamp('2026-04-13T12:00:00Z', { now: NOW })).toBe('6d ago');
    expect(formatEditedTimestamp('2026-04-12T13:00:00Z', { now: NOW })).toBe('6d ago');
  });

  it('falls through to full timestamp at seven days', () => {
    expect(
      formatEditedTimestamp('2026-04-12T12:00:00Z', {
        now: NOW,
        locale: 'en',
        timeZone: 'UTC',
      }),
    ).toBe('2026-04-12 12:00');
  });
});
