import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

export type CircleStatus =
  | { kind: 'unconfigured' }
  | { kind: 'active'; syncId: string }
  | { kind: 'pairing'; paircode: string; expiresAt: number }
  // Local keystore points at a syncId the server no longer recognises (401/404
  // on auth). Surfaces a re-pair CTA in the UI; engine stops heartbeating.
  | { kind: 'orphaned'; syncId: string }
  // User asked to disable sync but the server-side DELETE didn't succeed
  // (offline, 5xx, auth drift). Local keys are deliberately KEPT so the
  // retry can authenticate; the engine is stopped. A background scheduler
  // retries on `online` events + an interval until the server confirms
  // 200/204/404, at which point keys are wiped and we transition to
  // `unconfigured`. Survives reload via localStorage marker.
  | { kind: 'pending_deletion'; syncId: string; since: string };

export type DocSyncStatus =
  | { kind: 'off' }
  | { kind: 'idle'; lastSyncedAt: number; revision: number }
  | { kind: 'pending' }
  | { kind: 'syncing' }
  | { kind: 'conflict'; localRevision: number; serverRevision: number }
  | { kind: 'error'; message: string };

const [_circle, setCircle] = createSignal<CircleStatus>({ kind: 'unconfigured' });
const [_docs, setDocs] = createStore<Record<string, DocSyncStatus>>({});

export const circleStatus = _circle;
export const setCircleStatus = setCircle;

export function docStatusFor(docId: string): DocSyncStatus {
  return _docs[docId] ?? { kind: 'off' };
}

export function setDocStatus(docId: string, status: DocSyncStatus): void {
  setDocs(docId, status);
}
