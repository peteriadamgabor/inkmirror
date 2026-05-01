import type { UUID } from '@/types';
import { getActiveGates } from './revision-preset';

interface Tracked {
  at: number;
  contentLength: number;
}

const lastSnapshot = new Map<UUID, Tracked>();

export function shouldSnapshot(blockId: UUID, content: string): boolean {
  if (content.trim().length === 0) return false;
  const prev = lastSnapshot.get(blockId);
  if (!prev) return true; // first snapshot for this block always passes
  const gates = getActiveGates();
  const elapsed = Date.now() - prev.at;
  if (elapsed < gates.timeMs) return false;
  const lengthDelta = Math.abs(content.length - prev.contentLength);
  if (lengthDelta < gates.distanceChars) return false;
  return true;
}

export function recordSnapshot(blockId: UUID, content: string, at: number): void {
  lastSnapshot.set(blockId, { at, contentLength: content.length });
}

/** Called on document close so per-doc state doesn't leak between sessions. */
export function resetSnapshotTracking(): void {
  lastSnapshot.clear();
}
