import { SyncHttpError } from './client';
import type { SyncClient } from './client';
import { encryptBundle, decryptBundle } from './crypto';
import type { EncryptedBlob } from './crypto';
import { setCircleStatus, setDocStatus, docStatusFor } from './state';

export const DEBOUNCE_MS  = 10_000;
export const HEARTBEAT_MS = 5 * 60 * 1000;

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];

export interface EngineDeps {
  syncId: string;
  client: SyncClient;
  K_enc: Uint8Array;
  buildBundle: (docId: string) => Promise<Uint8Array>;
  applyBundle: (docId: string, plaintext: Uint8Array) => Promise<void>;
  getDocLastRevision: (docId: string) => number;
  setDocLastRevision: (docId: string, revision: number) => void;
  /** Optional: override the encrypt step (useful in tests to avoid real crypto.subtle scheduling). */
  encrypt?: (K_enc: Uint8Array, plaintext: Uint8Array, syncId: string, docId: string) => Promise<EncryptedBlob>;
  /** Optional: override the decrypt step (useful in tests to avoid real crypto.subtle scheduling). */
  decrypt?: (K_enc: Uint8Array, blob: EncryptedBlob, syncId: string, docId: string) => Promise<Uint8Array>;
}

export type ConflictResolution = 'keepLocal' | 'pullServer' | 'saveAsCopy' | 'decideLater';

export interface Engine {
  markDirty: (docId: string) => void;
  syncNow: () => Promise<void>;
  resolveConflict: (docId: string, choice: ConflictResolution) => Promise<void>;
  start: () => void;
  stop: () => void;
}

export function createEngine(deps: EngineDeps): Engine {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Incremented on stop(); async push operations check this to bail out early
  // and avoid writing stale state to the shared status store.
  let generation = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function markDirty(docId: string): void {
    setDocStatus(docId, { kind: 'pending' });
    const existing = debounceTimers.get(docId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => { void pushDoc(docId, generation, 0); }, DEBOUNCE_MS);
    debounceTimers.set(docId, t);
  }

  async function pushDoc(docId: string, gen: number, attempt: number): Promise<void> {
    if (attempt === 0) debounceTimers.delete(docId);
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
      if (err instanceof SyncHttpError && err.status === 409) {
        const body = err.body as { currentRevision: number } | null;
        setDocStatus(docId, {
          kind: 'conflict',
          localRevision: deps.getDocLastRevision(docId),
          serverRevision: body?.currentRevision ?? 0,
        });
        return;
      }
      const isRetryable =
        (err instanceof SyncHttpError && err.status >= 500) ||
        !(err instanceof SyncHttpError);
      if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
        setDocStatus(docId, { kind: 'pending' });
        const delay = RETRY_DELAYS_MS[attempt];
        const t = setTimeout(() => { void pushDoc(docId, gen, attempt + 1); }, delay);
        debounceTimers.set(docId, t);
        return;
      }
      setDocStatus(docId, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function pullDoc(docId: string, _expectedServerRevision: number): Promise<void> {
    setDocStatus(docId, { kind: 'syncing' });
    const gen = generation;
    try {
      const blob = await deps.client.getDoc(deps.syncId, docId);
      if (gen !== generation) return;
      const decryptFn = deps.decrypt ?? decryptBundle;
      const plaintext = await decryptFn(deps.K_enc, blob, deps.syncId, docId);
      if (gen !== generation) return;
      await deps.applyBundle(docId, plaintext);
      if (gen !== generation) return;
      deps.setDocLastRevision(docId, blob.revision);
      setDocStatus(docId, { kind: 'idle', lastSyncedAt: Date.now(), revision: blob.revision });
    } catch (err) {
      if (gen !== generation) return;
      setDocStatus(docId, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function heartbeat(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    let serverList: Array<{ docId: string; revision: number; updatedAt: string }>;
    try {
      serverList = await deps.client.list(deps.syncId);
    } catch (err) {
      // 401/404 on /sync/list means our local syncId+K_auth doesn't match any
      // server-side circle (KV evicted, server wipe, or a pairing that
      // happened before the production KV binding existed). Surface the state
      // to the UI and stop the heartbeat loop — re-pairing is the only path
      // forward, and silent retries every 5 min serve no one.
      if (err instanceof SyncHttpError && (err.status === 401 || err.status === 404)) {
        setCircleStatus({ kind: 'orphaned', syncId: deps.syncId });
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
      return; // other errors (network, 429, 5xx) silently skip; next heartbeat retries
    }

    for (const item of serverList) {
      const localRev = deps.getDocLastRevision(item.docId);
      if (item.revision <= localRev) continue;

      const status = docStatusFor(item.docId);
      if (status.kind === 'idle' || status.kind === 'off') {
        await pullDoc(item.docId, item.revision);
      } else if (status.kind === 'pending') {
        setDocStatus(item.docId, {
          kind: 'conflict',
          localRevision: localRev,
          serverRevision: item.revision,
        });
      }
      // syncing: in-flight PUT will resolve via 409
      // conflict / error: leave alone
    }
  }

  async function resolveConflict(docId: string, choice: ConflictResolution): Promise<void> {
    const s = docStatusFor(docId);
    if (s.kind !== 'conflict') return;
    if (choice === 'decideLater') return;

    if (choice === 'saveAsCopy') {
      throw new Error(
        'saveAsCopy must be handled by the caller (clone the local doc with sync_enabled=false, then call resolveConflict("pullServer") on the original)',
      );
    }

    if (choice === 'keepLocal') {
      // Inline push with expectedRevision = serverRevision so the server accepts our overwrite.
      setDocStatus(docId, { kind: 'syncing' });
      try {
        const plaintext = await deps.buildBundle(docId);
        const encryptFn = deps.encrypt ?? encryptBundle;
        const blob = await encryptFn(deps.K_enc, plaintext, deps.syncId, docId);
        const result = await deps.client.putDoc(
          deps.syncId,
          docId,
          { ...blob, expectedRevision: s.serverRevision },
        );
        deps.setDocLastRevision(docId, result.revision);
        setDocStatus(docId, { kind: 'idle', lastSyncedAt: Date.now(), revision: result.revision });
      } catch (err) {
        setDocStatus(docId, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // choice === 'pullServer'
    await pullDoc(docId, s.serverRevision);
  }

  return {
    markDirty,
    syncNow: async () => {
      // Flush all pending debounce timers — fire push immediately for each.
      for (const [docId, t] of debounceTimers.entries()) {
        clearTimeout(t);
        debounceTimers.delete(docId);
        void pushDoc(docId, generation, 0);
      }
      await heartbeat();
    },
    resolveConflict,
    start: () => {
      if (heartbeatTimer) return;
      heartbeatTimer = setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
    },
    stop: () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      generation++;
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
    },
  };
}
