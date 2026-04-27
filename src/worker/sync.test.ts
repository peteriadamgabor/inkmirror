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

function makeEnv(kv?: KVNamespace): Env {
  return {
    ASSETS: {} as Fetcher,
    DISCORD_WEBHOOK: undefined,
    INKMIRROR_SYNC_KV: kv ?? makeKVStub(),
    INKMIRROR_SYNC_R2: {} as R2Bucket,
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
