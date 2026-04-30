import { describe, expect, it } from 'vitest';
import { selectAnnouncements } from './select';
import type { Announcement } from './types';

const NOW = '2026-05-01T12:00:00.000Z';
const VERSION = '0.3.1';

function info(id: string, extra: Partial<Announcement> = {}): Announcement {
  return {
    id,
    severity: 'info',
    title: { en: `Title ${id}` },
    body: { en: `Body ${id}` },
    ...extra,
  };
}

function critical(id: string, extra: Partial<Announcement> = {}): Announcement {
  return {
    id,
    severity: 'critical',
    title: { en: `Critical ${id}` },
    body: { en: `Critical body ${id}` },
    ...extra,
  };
}

describe('selectAnnouncements', () => {
  it('returns empty when the list is empty', () => {
    const r = selectAnnouncements({
      list: [],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos).toEqual([]);
    expect(r.critical).toBeNull();
  });

  it('drops announcements whose publishedAt is in the future', () => {
    const future = info('2026-06-01-future', { publishedAt: '2026-05-15T00:00:00.000Z' });
    const present = info('2026-05-01-present');
    const r = selectAnnouncements({
      list: [future, present],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos.map((a) => a.id)).toEqual(['2026-05-01-present']);
  });

  it('drops announcements whose expiresAt is in the past', () => {
    const expired = info('2026-04-01-old', { expiresAt: '2026-04-15T00:00:00.000Z' });
    const live = info('2026-05-01-live');
    const r = selectAnnouncements({
      list: [expired, live],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos.map((a) => a.id)).toEqual(['2026-05-01-live']);
  });

  it('respects minVersion / maxVersion gates', () => {
    const tooNew = info('only-new', { minVersion: '0.4.0' });
    const tooOld = info('only-old', { maxVersion: '0.3.0' });
    const just = info('just-right', { minVersion: '0.3.0', maxVersion: '0.4.0' });
    const r = selectAnnouncements({
      list: [tooNew, tooOld, just],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos.map((a) => a.id)).toEqual(['just-right']);
  });

  it('skips info announcements whose id is at or below the watermark', () => {
    const seen = info('2026-04-30');
    const fresh = info('2026-05-02');
    const r = selectAnnouncements({
      list: [seen, fresh],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: '2026-04-30',
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos.map((a) => a.id)).toEqual(['2026-05-02']);
  });

  it('caps info announcements at MAX_INFO_PER_BOOT (=3) — newest first', () => {
    const list: Announcement[] = [
      info('2026-05-01'),
      info('2026-05-02'),
      info('2026-05-03'),
      info('2026-05-04'),
      info('2026-05-05'),
    ];
    const r = selectAnnouncements({
      list,
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(),
    });
    expect(r.infos.map((a) => a.id)).toEqual([
      '2026-05-05',
      '2026-05-04',
      '2026-05-03',
    ]);
  });

  it('surfaces only the highest-id unacknowledged critical', () => {
    const list: Announcement[] = [
      critical('2026-05-01-A'),
      critical('2026-05-02-B'),
      critical('2026-05-03-C'),
    ];
    const r = selectAnnouncements({
      list,
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(['2026-05-03-C']),
    });
    expect(r.critical?.id).toBe('2026-05-02-B');
  });

  it('returns no critical when all are acknowledged', () => {
    const list: Announcement[] = [
      critical('A'),
      critical('B'),
    ];
    const r = selectAnnouncements({
      list,
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: null,
      acknowledgedCriticals: new Set(['A', 'B']),
    });
    expect(r.critical).toBeNull();
  });

  it('bypassDedup ignores watermark and acknowledgement state (preview path)', () => {
    const r = selectAnnouncements({
      list: [
        info('2026-04-30'),
        critical('2026-05-01-X'),
      ],
      runningVersion: VERSION,
      now: NOW,
      lastSeenInfoId: '2030-01-01',          // would normally hide everything
      acknowledgedCriticals: new Set(['2026-05-01-X']),
      bypassDedup: true,
    });
    expect(r.infos.map((a) => a.id)).toEqual(['2026-04-30']);
    expect(r.critical?.id).toBe('2026-05-01-X');
  });
});
