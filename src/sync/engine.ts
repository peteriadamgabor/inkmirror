import { SyncHttpError } from './client';
import type { SyncClient } from './client';
import { encryptBundle, decryptBundle } from './crypto';
import type { EncryptedBlob } from './crypto';
import { setCircleStatus, setDocStatus, docStatusFor, allDocStatuses } from './state';
import { bytesHash } from '@/utils/hash';

export const DEBOUNCE_MS  = 10_000;
export const HEARTBEAT_MS = 5 * 60 * 1000;

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];

export interface EngineDeps {
  syncId: string;
  client: SyncClient;
  /**
   * Non-extractable AES-GCM CryptoKey — see `importEncKey` in
   * `./crypto.ts` for the rationale. Only encrypt/decrypt operations
   * can be performed with this handle; the raw bytes cannot be read
   * back out of memory.
   */
  K_enc: CryptoKey;
  buildBundle: (docId: string) => Promise<Uint8Array>;
  applyBundle: (docId: string, plaintext: Uint8Array) => Promise<void>;
  getDocLastRevision: (docId: string) => number;
  setDocLastRevision: (docId: string, revision: number) => void;
  /**
   * Per-document opt-in gate. The engine consults this before every push
   * AND before pulling a doc the server lists — a doc the user toggled
   * off must neither leave nor enter this device. Defaults to "enabled"
   * when omitted (legacy behavior, used by older tests).
   */
  isDocSyncEnabled?: (docId: string) => boolean;
  /** Optional: override the encrypt step (useful in tests to avoid real crypto.subtle scheduling). */
  encrypt?: (K_enc: CryptoKey, plaintext: Uint8Array, syncId: string, docId: string) => Promise<EncryptedBlob>;
  /** Optional: override the decrypt step (useful in tests to avoid real crypto.subtle scheduling). */
  decrypt?: (K_enc: CryptoKey, blob: EncryptedBlob, syncId: string, docId: string) => Promise<Uint8Array>;
}

export type ConflictResolution = 'keepLocal' | 'pullServer' | 'saveAsCopy' | 'decideLater';

export interface Engine {
  markDirty: (docId: string) => void;
  syncNow: () => Promise<void>;
  resolveConflict: (docId: string, choice: ConflictResolution) => Promise<void>;
  /** React to a sync_enabled toggle: ON pushes the doc's current state, OFF cancels any queued push. */
  setDocEnabled: (docId: string, enabled: boolean) => void;
  start: () => void;
  stop: () => void;
}

export function createEngine(deps: EngineDeps): Engine {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Incremented on stop(); async push operations check this to bail out early
  // and avoid writing stale state to the shared status store.
  let generation = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Per-doc hash of the last plaintext bundle the server is known to hold
  // (set on successful push AND on pull/apply). markDirty fires for every
  // tracked IDB write — including sentiment rows from the AI worker — so
  // without this gate an unchanged doc gets re-encrypted and re-uploaded,
  // bumping the server revision and forcing every other device to pull
  // bytes it already has. In-memory only: a reload re-pushes once, which
  // is acceptable.
  const lastPushedHash = new Map<string, string>();

  const enabled = (docId: string): boolean => deps.isDocSyncEnabled?.(docId) ?? true;

  function markDirty(docId: string): void {
    if (!enabled(docId)) return;
    setDocStatus(docId, { kind: 'pending' });
    const existing = debounceTimers.get(docId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => { void pushDoc(docId, generation, 0); }, DEBOUNCE_MS);
    debounceTimers.set(docId, t);
  }

  async function pushDoc(docId: string, gen: number, attempt: number): Promise<void> {
    if (attempt === 0) debounceTimers.delete(docId);
    if (gen !== generation) return;
    // Re-check at fire time: the toggle may have flipped while the
    // debounce or a retry timer was pending.
    if (!enabled(docId)) {
      setDocStatus(docId, { kind: 'off' });
      return;
    }
    setDocStatus(docId, { kind: 'syncing' });
    try {
      const plaintext = await deps.buildBundle(docId);
      if (gen !== generation) return;
      // Unchanged since the last push/pull? Skip the encrypt + PUT +
      // revision bump entirely — the server already has these bytes.
      const plaintextHash = bytesHash(plaintext);
      if (plaintextHash === lastPushedHash.get(docId)) {
        setDocStatus(docId, {
          kind: 'idle',
          lastSyncedAt: Date.now(),
          revision: deps.getDocLastRevision(docId),
        });
        return;
      }
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
      lastPushedHash.set(docId, plaintextHash);
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
      if (err instanceof SyncHttpError && (err.status === 401 || err.status === 410)) {
        // Auth no longer matches any server-side circle — same terminal
        // state the heartbeat detects. Surface it instead of a dead-end
        // per-doc ERROR.
        setCircleStatus({ kind: 'orphaned', syncId: deps.syncId });
        setDocStatus(docId, { kind: 'off' });
        return;
      }
      // 429: the write limiter tripped (6/min — reachable while actively
      // writing). It clears on its own, so it MUST be retryable — landing
      // in ERROR wedged sync until reload.
      const isRetryable =
        (err instanceof SyncHttpError && (err.status >= 500 || err.status === 429)) ||
        !(err instanceof SyncHttpError);
      // Offline: don't burn the backoff budget on a connection that can't
      // possibly succeed (6 steps ≈ 63s, then a wedged ERROR). Park the doc
      // as 'pending' with NO retry timer — the 'online' handler re-pushes
      // parked docs the moment connectivity returns.
      if (isRetryable && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setDocStatus(docId, { kind: 'pending' });
        return;
      }
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
      // Remember what the server holds — a just-pulled doc whose next
      // local rebuild serializes to the same bytes must not re-push.
      lastPushedHash.set(docId, bytesHash(plaintext));
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
      if (err instanceof SyncHttpError && (err.status === 401 || err.status === 404 || err.status === 410)) {
        setCircleStatus({ kind: 'orphaned', syncId: deps.syncId });
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
      return; // other errors (network, 429, 5xx) silently skip; next heartbeat retries
    }

    for (const item of serverList) {
      // A doc toggled off on this device neither pushes nor pulls.
      if (!enabled(item.docId)) continue;
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
        lastPushedHash.set(docId, bytesHash(plaintext));
        setDocStatus(docId, { kind: 'idle', lastSyncedAt: Date.now(), revision: result.revision });
      } catch (err) {
        setDocStatus(docId, { kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // choice === 'pullServer'
    await pullDoc(docId, s.serverRevision);
  }

  async function syncNow(): Promise<void> {
    // Flush all pending debounce timers — fire push immediately for each.
    for (const [docId, t] of debounceTimers.entries()) {
      clearTimeout(t);
      debounceTimers.delete(docId);
      void pushDoc(docId, generation, 0);
    }
    await heartbeat();
  }

  // Connectivity returned: re-queue docs parked by an offline push
  // ('pending' with no timer) or wedged in 'error' from a burned-out
  // backoff, then flush + heartbeat. Without the re-queue, the user would
  // wait out the rest of the 5-minute interval — and 'error' docs would
  // never push again at all (heartbeat only pulls and skips them).
  const onOnline = (): void => {
    for (const [docId, status] of allDocStatuses()) {
      if (status.kind === 'pending' || status.kind === 'error') {
        markDirty(docId); // re-checks the enabled gate internally
      }
    }
    void syncNow();
  };

  return {
    markDirty,
    syncNow,
    resolveConflict,
    setDocEnabled: (docId: string, isEnabled: boolean): void => {
      if (isEnabled) {
        // Push the doc's current state — edits made while sync was off
        // would otherwise sit local until the next incidental edit.
        markDirty(docId);
        return;
      }
      const t = debounceTimers.get(docId);
      if (t) {
        clearTimeout(t);
        debounceTimers.delete(docId);
      }
      setDocStatus(docId, { kind: 'off' });
    },
    start: () => {
      if (heartbeatTimer) return;
      heartbeatTimer = setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', onOnline);
      }
    },
    stop: () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
      }
      generation++;
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
    },
  };
}
