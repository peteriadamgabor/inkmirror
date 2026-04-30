/**
 * Reactive state for the announcements UI surface.
 *
 * The pending lists are signals so a fetch (boot or poll) can swap
 * what's surfaced without a full re-mount of the host components.
 */

import { createSignal } from 'solid-js';
import type { Announcement } from './types';

const [_pendingInfos, setPendingInfos] = createSignal<Announcement[]>([]);
const [_pendingCritical, setPendingCritical] = createSignal<Announcement | null>(null);

export const pendingInfos = _pendingInfos;
export const pendingCritical = _pendingCritical;

export function setSurfacedAnnouncements(args: {
  infos: Announcement[];
  critical: Announcement | null;
}): void {
  setPendingInfos(args.infos);
  setPendingCritical(args.critical);
}

export function dismissInfo(id: string): void {
  setPendingInfos((list) => list.filter((a) => a.id !== id));
}

export function dismissCritical(): void {
  setPendingCritical(null);
}
