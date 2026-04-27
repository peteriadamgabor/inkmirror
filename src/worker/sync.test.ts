// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handleSync } from './sync';
import { fromBase64Url, toBase64Url } from '../sync/crypto';
import type { Env } from './types';

// ---------- minimal KV stub ----------

interface KVEntry { value: string; options?: KVNamespacePutOptions }

function makeKVStub(): KVNamespace & { _store: Map<string, KVEntry> } {
  const _store = new Map<string, KVEntry>();
  return {
    _store,
    async put(key: string, value: string, options?: KVNamespacePutOptions) {
      _store.set(key, { value, options });
    },
    async get(key: string) {
      return _store.get(key)?.value ?? null;
    },
    async getWithMetadata(key: string) {
      const entry = _store.get(key);
      return { value: entry?.value ?? null, metadata: null, cacheStatus: null };
    },
    async delete(key: string) {
      _store.delete(key);
    },
    async list(opts?: { prefix?: string; cursor?: string }) {
      const prefix = opts?.prefix ?? '';
      const keys = Array.from(_store.keys())
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name }));
      return { keys, list_complete: true, cacheStatus: null };
    },
  } as unknown as KVNamespace & { _store: Map<string, KVEntry> };
}

function makeR2Stub(): R2Bucket & { _store: Map<string, string> } {
  const _store = new Map<string, string>();
  return {
    _store,
    async put(key: string, body: string | ArrayBuffer | Uint8Array | ReadableStream, _opts?: R2PutOptions) {
      const text = typeof body === 'string' ? body
        : body instanceof Uint8Array ? new TextDecoder().decode(body)
        : body instanceof ArrayBuffer ? new TextDecoder().decode(body)
        : '';
      _store.set(key, text);
      return { key, version: 'v1', size: text.length, etag: 'mock', httpEtag: 'mock', uploaded: new Date(), checksums: {} as R2Checksums, httpMetadata: {}, customMetadata: {} } as R2Object;
    },
    async get(key: string) {
      const text = _store.get(key);
      if (text === undefined) return null;
      return {
        key,
        version: 'v1',
        size: text.length,
        etag: 'mock',
        httpEtag: 'mock',
        uploaded: new Date(),
        checksums: {} as R2Checksums,
        httpMetadata: {},
        customMetadata: {},
        async json<T>() { return JSON.parse(text) as T; },
        async text() { return text; },
        async arrayBuffer() { return new TextEncoder().encode(text).buffer; },
        body: null as unknown as ReadableStream,
        bodyUsed: false,
        async blob() { return new Blob([text]); },
        writeHttpMetadata: () => {},
      } as unknown as R2ObjectBody;
    },
    async delete(key: string | string[]) {
      if (Array.isArray(key)) key.forEach(k => _store.delete(k));
      else _store.delete(key);
    },
  } as unknown as R2Bucket & { _store: Map<string, string> };
}

function makeEnv(kv?: KVNamespace, r2?: R2Bucket): Env {
  return {
    ASSETS: {} as Fetcher,
    DISCORD_WEBHOOK: undefined,
    INKMIRROR_SYNC_KV: kv ?? makeKVStub(),
    INKMIRROR_SYNC_R2: r2 ?? makeR2Stub(),
  };
}

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://x/sync/circles', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- tests ----------

describe('POST /sync/circles', () => {
  it('creates a circle and returns a syncId', async () => {
    const kv = makeKVStub();
    const env = makeEnv(kv);
    const body = {
      auth_proof: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
      salt:       toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    };

    const res = await handleSync(makeRequest(body), env);

    expect(res.status).toBe(201);
    const json = await res.json() as { syncId: string };
    expect(json.syncId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(json.syncId).length).toBe(16);

    // KV should have the circle stored
    const kvKey = `circle:${json.syncId}`;
    expect(kv._store.has(kvKey)).toBe(true);
    const stored = JSON.parse(kv._store.get(kvKey)!.value);
    expect(stored.salt).toBe(body.salt);
    expect(stored.auth_proof).toBe(body.auth_proof);
    expect(typeof stored.createdAt).toBe('string');
  });

  it('rejects request with malformed auth_proof length', async () => {
    const body = {
      auth_proof: toBase64Url(new Uint8Array(8)),  // wrong length (8 instead of 32)
      salt:       toBase64Url(new Uint8Array(16)),
    };

    const res = await handleSync(makeRequest(body), makeEnv());

    expect(res.status).toBe(400);
  });

  it('rejects request with missing fields', async () => {
    const res = await handleSync(makeRequest({ auth_proof: 'only-one-field' }), makeEnv());
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown sub-paths', async () => {
    const req = new Request('http://x/sync/unknown', { method: 'GET' });
    const res = await handleSync(req, makeEnv());
    expect(res.status).toBe(404);
  });
});

// helper: create a circle and return everything tests need
async function createCircle(env: Env): Promise<{
  syncId: string;
  K_auth: Uint8Array;
  K_auth_b64: string;
  auth_proof_b64: string;
  salt_b64: string;
}> {
  const K_auth = crypto.getRandomValues(new Uint8Array(32));
  const auth_proof = new Uint8Array(await crypto.subtle.digest('SHA-256', K_auth));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const auth_proof_b64 = toBase64Url(auth_proof);
  const K_auth_b64 = toBase64Url(K_auth);
  const salt_b64 = toBase64Url(salt);

  const res = await handleSync(makeRequest({ auth_proof: auth_proof_b64, salt: salt_b64 }), env);
  const { syncId } = (await res.json()) as { syncId: string };
  return { syncId, K_auth, K_auth_b64, auth_proof_b64, salt_b64 };
}

function authedRequest(url: string, K_auth_b64: string, body: unknown = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${K_auth_b64}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /sync/circles/:syncId/paircode', () => {
  it('issues a paircode for an authenticated request', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      authedRequest(`http://x/sync/circles/${syncId}/paircode`, K_auth_b64),
      env,
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { paircode: string; expiresAt: string };
    expect(j.paircode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(new Date(j.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects unauthenticated requests with 401', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/circles/${syncId}/paircode`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong K_auth (bad bearer token)', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const wrongK_auth = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const res = await handleSync(
      authedRequest(`http://x/sync/circles/${syncId}/paircode`, wrongK_auth),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /sync/pair/redeem', () => {
  it('redeems a valid paircode and returns syncId + salt', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64, salt_b64 } = await createCircle(env);

    const issue = await handleSync(
      authedRequest(`http://x/sync/circles/${syncId}/paircode`, K_auth_b64),
      env,
    );
    const { paircode } = (await issue.json()) as { paircode: string };

    const redeemReq = new Request('http://x/sync/pair/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paircode }),
    });
    const redeem = await handleSync(redeemReq, env);
    expect(redeem.status).toBe(200);
    const r = (await redeem.json()) as { syncId: string; salt: string };
    expect(r.syncId).toBe(syncId);
    expect(r.salt).toBe(salt_b64);
  });

  it('rejects an unknown paircode with 410', async () => {
    const env = makeEnv();
    const res = await handleSync(
      new Request('http://x/sync/pair/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paircode: 'ZZZZZZ' }),
      }),
      env,
    );
    expect(res.status).toBe(410);
  });

  it('rejects a paircode redeemed twice (single-use)', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const issue = await handleSync(
      authedRequest(`http://x/sync/circles/${syncId}/paircode`, K_auth_b64),
      env,
    );
    const { paircode } = (await issue.json()) as { paircode: string };

    const redeemReq = () => new Request('http://x/sync/pair/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paircode }),
    });

    const first = await handleSync(redeemReq(), env);
    expect(first.status).toBe(200);

    const second = await handleSync(redeemReq(), env);
    expect(second.status).toBe(410);
  });

  it('rejects a malformed paircode (wrong length / chars) with 410', async () => {
    const env = makeEnv();
    const res = await handleSync(
      new Request('http://x/sync/pair/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paircode: '0000' }),  // contains '0', wrong length
      }),
      env,
    );
    expect(res.status).toBe(410);
  });
});

describe('GET /sync/list/:syncId', () => {
  it('returns an empty list for a fresh circle', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns the meta records for docs that have been put', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, { value: string }> };
    // Pre-populate two meta records directly into the stub
    kv._store.set(`meta:${syncId}:doc-1`, { value: JSON.stringify({ revision: 3, updatedAt: '2026-04-27T12:00:00Z' }) });
    kv._store.set(`meta:${syncId}:doc-2`, { value: JSON.stringify({ revision: 7, updatedAt: '2026-04-27T13:00:00Z' }) });

    const res = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ docId: string; revision: number; updatedAt: string }>;
    expect(list).toHaveLength(2);
    expect(list.find(x => x.docId === 'doc-1')).toMatchObject({ revision: 3, updatedAt: '2026-04-27T12:00:00Z' });
    expect(list.find(x => x.docId === 'doc-2')).toMatchObject({ revision: 7, updatedAt: '2026-04-27T13:00:00Z' });
  });

  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const res = await handleSync(new Request(`http://x/sync/list/${syncId}`), env);
    expect(res.status).toBe(401);
  });
});

// ---------- PUT /sync/doc ----------

const TEN_MB = 10 * 1024 * 1024;

function authedJsonRequest(url: string, K_auth_b64: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${K_auth_b64}`,
    },
    body: JSON.stringify(body),
  });
}

describe('PUT /sync/doc/:syncId/:docId', () => {
  it('first PUT with expectedRevision 0 stores the blob and returns revision 1', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: toBase64Url(new Uint8Array([1,2,3,4])),
    };
    const res = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { revision: number; updatedAt: string };
    expect(j.revision).toBe(1);
    expect(typeof j.updatedAt).toBe('string');
  });

  it('second PUT with correct expectedRevision increments to 2', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = (n: number) => ({
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: toBase64Url(new Uint8Array([n])),
    });
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob(1), expectedRevision: 0 }),
      env,
    );
    const res = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob(2), expectedRevision: 1 }),
      env,
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { revision: number };
    expect(j.revision).toBe(2);
  });

  it('returns 409 with currentRevision when expectedRevision is stale', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: toBase64Url(new Uint8Array([1,2,3,4])),
    };
    // first PUT lands at rev 1
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    // second PUT with wrong expectedRevision 0 → 409
    const stale = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    expect(stale.status).toBe(409);
    const conflict = (await stale.json()) as { currentRevision: number };
    expect(conflict.currentRevision).toBe(1);
  });

  it('rejects oversized blobs with 413', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const huge = 'A'.repeat(TEN_MB + 1024);
    const res = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { v: 1, iv: 'AAAAAAAAAAAAAAAA', ciphertext: huge, expectedRevision: 0 }),
      env,
    );
    expect(res.status).toBe(413);
  });

  it('rejects unauthenticated PUT with 401', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-1`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: 1, iv: 'AA', ciphertext: 'BB', expectedRevision: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects unsupported wire version with 400', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { v: 99, iv: 'AA', ciphertext: 'BB', expectedRevision: 0 }),
      env,
    );
    expect(res.status).toBe(400);
  });
});
