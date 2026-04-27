import { toBase64Url } from './crypto';
import type { EncryptedBlob } from './crypto';

export interface SyncClientOptions {
  baseUrl: string;    // e.g., '' for same-origin, or 'https://inkmirror.peteriadamgabor.workers.dev'
  K_auth: Uint8Array; // 32 bytes; base64url-encoded into Authorization
}

export class SyncHttpError extends Error {
  override readonly name = 'SyncHttpError';
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`sync http ${status}`);
  }
}

export interface SyncListEntry {
  docId: string;
  revision: number;
  updatedAt: string;
}

export interface SyncClient {
  createCircle(args: { auth_proof_b64: string; salt_b64: string }): Promise<{ syncId: string }>;
  issuePaircode(syncId: string): Promise<{ paircode: string; expiresAt: string }>;
  redeemPaircode(paircode: string): Promise<{ syncId: string; salt: string }>;
  list(syncId: string): Promise<SyncListEntry[]>;
  putDoc(
    syncId: string,
    docId: string,
    payload: EncryptedBlob & { expectedRevision: number },
  ): Promise<{ revision: number; updatedAt: string }>;
  getDoc(
    syncId: string,
    docId: string,
  ): Promise<EncryptedBlob & { revision: number; updatedAt: string }>;
  deleteDoc(syncId: string, docId: string): Promise<void>;
  deleteCircle(syncId: string): Promise<void>;
}

export function createSyncClient(opts: SyncClientOptions): SyncClient {
  const auth = `Bearer ${toBase64Url(opts.K_auth)}`;

  const j = <T>(path: string, init?: RequestInit, withAuth = true) =>
    request<T>(opts.baseUrl + path, init, withAuth ? auth : undefined);

  return {
    createCircle: ({ auth_proof_b64, salt_b64 }) =>
      j('/sync/circles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_proof: auth_proof_b64, salt: salt_b64 }),
      }, false),

    issuePaircode: (syncId) =>
      j(`/sync/circles/${syncId}/paircode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),

    redeemPaircode: (paircode) =>
      j('/sync/pair/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paircode }),
      }, false),

    list: (syncId) => j(`/sync/list/${syncId}`),

    putDoc: (syncId, docId, payload) =>
      j(`/sync/doc/${syncId}/${docId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),

    getDoc: (syncId, docId) => j(`/sync/doc/${syncId}/${docId}`),

    deleteDoc: (syncId, docId) =>
      j<void>(`/sync/doc/${syncId}/${docId}`, { method: 'DELETE' }).then(() => undefined),

    deleteCircle: (syncId) =>
      j<void>(`/sync/circles/${syncId}`, { method: 'DELETE' }).then(() => undefined),
  };
}

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  authHeader: string | undefined,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (authHeader) headers.set('authorization', authHeader);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let body: unknown = null;
    if (res.headers.get('content-type')?.includes('application/json')) {
      try { body = await res.json(); } catch { /* leave body as null */ }
    }
    throw new SyncHttpError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
