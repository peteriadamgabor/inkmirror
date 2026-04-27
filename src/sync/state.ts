import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

export type CircleStatus =
  | { kind: 'unconfigured' }
  | { kind: 'active'; syncId: string }
  | { kind: 'pairing'; paircode: string; expiresAt: number };

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
