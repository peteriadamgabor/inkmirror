import type { SyncClient } from './client';
import { encryptBundle } from './crypto';
import { setDocStatus } from './state';

export const DEBOUNCE_MS  = 10_000;
export const HEARTBEAT_MS = 5 * 60 * 1000;

export interface EngineDeps {
  syncId: string;
  client: SyncClient;
  K_enc: Uint8Array;
  buildBundle: (docId: string) => Promise<Uint8Array>;
  applyBundle: (docId: string, plaintext: Uint8Array) => Promise<void>;
  getDocLastRevision: (docId: string) => number;
  setDocLastRevision: (docId: string, revision: number) => void;
  /** Optional: override the encrypt step (useful in tests to avoid real crypto.subtle scheduling). */
  encrypt?: (K_enc: Uint8Array, plaintext: Uint8Array, syncId: string, docId: string) => Promise<import('./crypto').EncryptedBlob>;
}

export interface Engine {
  markDirty: (docId: string) => void;
  syncNow: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

export function createEngine(deps: EngineDeps): Engine {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Incremented on stop(); async push operations check this to bail out early
  // and avoid writing stale state to the shared status store.
  let generation = 0;

  function markDirty(docId: string): void {
    setDocStatus(docId, { kind: 'pending' });
    const existing = debounceTimers.get(docId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => { void pushDoc(docId, generation); }, DEBOUNCE_MS);
    debounceTimers.set(docId, t);
  }

  async function pushDoc(docId: string, gen: number): Promise<void> {
    debounceTimers.delete(docId);
    if (gen !== generation) return;
    setDocStatus(docId, { kind: 'syncing' });
    try {
      const plaintext = await deps.buildBundle(docId);
      if (gen !== generation) return;
      const encryptFn = deps.encrypt ?? encryptBundle;
      const blob = await encryptFn(deps.K_enc, plaintext, deps.syncId, docId);
      if (gen !== generation) return;
      const expectedRevision = deps.getDocLastRevision(docId);
      const result = await deps.client.putDoc(
        deps.syncId,
        docId,
        { ...blob, expectedRevision },
      );
      if (gen !== generation) return;
      deps.setDocLastRevision(docId, result.revision);
      setDocStatus(docId, { kind: 'idle', lastSyncedAt: Date.now(), revision: result.revision });
    } catch (err) {
      if (gen !== generation) return;
      // E2 will refine this; for E1 we just transition to error.
      setDocStatus(docId, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    markDirty,
    syncNow: async () => {
      // Placeholder — E5 wires this up properly.
    },
    start: () => {
      // Placeholder — E3 starts the heartbeat here.
    },
    stop: () => {
      generation++;
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
    },
  };
}
