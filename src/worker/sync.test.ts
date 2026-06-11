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

interface R2StubEntry {
  text: string;
  etag: string;
  customMetadata: Record<string, string>;
  uploaded: Date;
  /** Quota tests fake huge objects without allocating huge strings. */
  sizeOverride?: number;
}

/**
 * Faithful-enough R2 fake: per-write etags, head(), conditional puts
 * (onlyIf etagMatches / etagDoesNotMatch — returns null on a failed
 * precondition, like real R2), and prefix list() with customMetadata.
 * The conditional-put semantics are what the revision CAS tests rely on.
 */
function makeR2Stub(): R2Bucket & { _store: Map<string, R2StubEntry> } {
  const _store = new Map<string, R2StubEntry>();
  let etagCounter = 0;

  const toObject = (key: string, e: R2StubEntry): R2Object =>
    ({
      key,
      version: 'v1',
      size: e.sizeOverride ?? e.text.length,
      etag: e.etag,
      httpEtag: `"${e.etag}"`,
      uploaded: e.uploaded,
      checksums: {} as R2Checksums,
      httpMetadata: {},
      customMetadata: e.customMetadata,
    }) as unknown as R2Object;

  return {
    _store,
    async put(
      key: string,
      body: string | ArrayBuffer | Uint8Array | ReadableStream,
      opts?: R2PutOptions,
    ) {
      const onlyIf = opts?.onlyIf as
        | { etagMatches?: string; etagDoesNotMatch?: string }
        | undefined;
      const existing = _store.get(key);
      if (onlyIf?.etagMatches !== undefined) {
        if (!existing || existing.etag !== onlyIf.etagMatches) return null;
      }
      if (onlyIf?.etagDoesNotMatch === '*' && existing) return null;

      const text = typeof body === 'string' ? body
        : body instanceof Uint8Array ? new TextDecoder().decode(body)
        : body instanceof ArrayBuffer ? new TextDecoder().decode(body)
        : '';
      const entry: R2StubEntry = {
        text,
        etag: `etag-${++etagCounter}`,
        customMetadata: { ...(opts?.customMetadata as Record<string, string> | undefined) },
        uploaded: new Date('2026-06-11T10:00:00Z'),
      };
      _store.set(key, entry);
      return toObject(key, entry);
    },
    async head(key: string) {
      const e = _store.get(key);
      return e ? toObject(key, e) : null;
    },
    async get(key: string) {
      const e = _store.get(key);
      if (!e) return null;
      return {
        ...toObject(key, e),
        async json<T>() { return JSON.parse(e.text) as T; },
        async text() { return e.text; },
        async arrayBuffer() { return new TextEncoder().encode(e.text).buffer; },
        body: null as unknown as ReadableStream,
        bodyUsed: false,
        async blob() { return new Blob([e.text]); },
        writeHttpMetadata: () => {},
      } as unknown as R2ObjectBody;
    },
    async delete(key: string | string[]) {
      if (Array.isArray(key)) key.forEach(k => _store.delete(k));
      else _store.delete(key);
    },
    async list(opts?: { prefix?: string; cursor?: string; include?: string[] }) {
      const prefix = opts?.prefix ?? '';
      const objects = Array.from(_store.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, e]) => toObject(k, e));
      return { objects, truncated: false, delimitedPrefixes: [] };
    },
  } as unknown as R2Bucket & { _store: Map<string, R2StubEntry> };
}

function makeRateLimit(): { limit(opts: { key: string }): Promise<{ success: boolean }> } {
  return { async limit() { return { success: true }; } };
}

function makeEnv(kv?: KVNamespace, r2?: R2Bucket): Env {
  return {
    ASSETS: {} as Fetcher,
    DISCORD_WEBHOOK: undefined,
    INKMIRROR_SYNC_KV: kv ?? makeKVStub(),
    INKMIRROR_SYNC_R2: r2 ?? makeR2Stub(),
    RL_SYNC_WRITE: makeRateLimit() as Env['RL_SYNC_WRITE'],
    RL_SYNC_READ:  makeRateLimit() as Env['RL_SYNC_READ'],
    RL_SYNC_PAIR:  makeRateLimit() as Env['RL_SYNC_PAIR'],
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

  it('lists docs that have been put, with revisions from R2 metadata', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    await putDocAs(env, syncId, K_auth_b64, 'doc-1', 0);
    await putDocAs(env, syncId, K_auth_b64, 'doc-2', 0);
    await putDocAs(env, syncId, K_auth_b64, 'doc-2', 1);

    const res = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ docId: string; revision: number; updatedAt: string }>;
    expect(list).toHaveLength(2);
    expect(list.find(x => x.docId === 'doc-1')).toMatchObject({ revision: 1 });
    expect(list.find(x => x.docId === 'doc-2')).toMatchObject({ revision: 2 });
  });

  it('lists legacy blobs (no R2 revision metadata) with the KV mirror revision', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // Legacy state: blob without customMetadata + KV meta record.
    const r2 = env.INKMIRROR_SYNC_R2 as R2Bucket & { _store: Map<string, unknown> };
    await r2.put(`${syncId}/doc-legacy`, JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'ct' }));
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, { value: string }> };
    kv._store.set(`meta:${syncId}:doc-legacy`, {
      value: JSON.stringify({ revision: 7, updatedAt: '2026-04-27T13:00:00Z' }),
    });

    const res = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ docId: string; revision: number; updatedAt: string }>;
    expect(list).toEqual([
      { docId: 'doc-legacy', revision: 7, updatedAt: '2026-04-27T13:00:00Z' },
    ]);
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

async function putDocAs(
  env: Env,
  syncId: string,
  K_auth_b64: string,
  docId: string,
  expectedRevision: number,
): Promise<Response> {
  return handleSync(
    authedJsonRequest(`http://x/sync/doc/${syncId}/${docId}`, K_auth_b64, 'PUT', {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: toBase64Url(new Uint8Array([1, 2, 3, 4])),
      expectedRevision,
    }),
    env,
  );
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

describe('GET /sync/doc/:syncId/:docId', () => {
  it('returns a previously PUT blob with revision and updatedAt', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: toBase64Url(new Uint8Array([7, 8, 9, 10])),
    };
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    const res = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-1`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { v: 1; iv: string; ciphertext: string; revision: number; updatedAt: string };
    expect(j.v).toBe(1);
    expect(j.iv).toBe(blob.iv);
    expect(j.ciphertext).toBe(blob.ciphertext);
    expect(j.revision).toBe(1);
    expect(typeof j.updatedAt).toBe('string');
  });

  it('returns 404 for a doc that was never written', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/missing`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-1`),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /sync/doc/:syncId/:docId', () => {
  it('deletes the blob and meta, subsequent GET 404s', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: 'AAAA',
    };
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    const del = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-1`, {
        method: 'DELETE',
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(del.status).toBe(204);
    const after = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-1`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(after.status).toBe(404);
  });

  it('DELETE on a missing doc still returns 204 (idempotent)', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/never-existed`, {
        method: 'DELETE',
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(204);
  });
});

describe('DELETE /sync/circles/:syncId', () => {
  it('deletes all docs, meta, and circle record', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const blob = {
      v: 1,
      iv: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
      ciphertext: 'AAAA',
    };
    // PUT two docs
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-1`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );
    await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/doc-2`, K_auth_b64, 'PUT', { ...blob, expectedRevision: 0 }),
      env,
    );

    // Delete the circle
    const del = await handleSync(
      new Request(`http://x/sync/circles/${syncId}`, {
        method: 'DELETE',
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(del.status).toBe(204);

    // Subsequent auth fails (circle gone). Returns 401 (not 404) so an
    // attacker can't distinguish unknown syncId from wrong K_auth.
    const afterList = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(afterList.status).toBe(401);

    // R2 doc blobs are gone too
    const r2 = env.INKMIRROR_SYNC_R2 as R2Bucket & { _store: Map<string, string> };
    expect(r2._store.size).toBe(0);

    // No leftover KV records
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, { value: string }> };
    expect(Array.from(kv._store.keys()).filter(k => k.startsWith(`meta:${syncId}:`)).length).toBe(0);
    expect(kv._store.has(`circle:${syncId}`)).toBe(false);
  });

  it('rejects unauthenticated DELETE with 401', async () => {
    const env = makeEnv();
    const { syncId } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/circles/${syncId}`, { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('returns 429 when the read limiter rejects', async () => {
    const denyRead = { async limit() { return { success: false }; } };
    const env = makeEnv();
    (env as unknown as Record<string, unknown>).RL_SYNC_READ = denyRead;
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await handleSync(
      new Request(`http://x/sync/list/${syncId}`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(429);
  });

  it('per-IP RL fires before any KV read for a guessed syncId', async () => {
    const env = makeEnv();
    let kvReads = 0;
    const realKv = env.INKMIRROR_SYNC_KV;
    (env as unknown as Record<string, unknown>).INKMIRROR_SYNC_KV = new Proxy(realKv, {
      get(target, prop, receiver) {
        if (prop === 'get') {
          return (key: string) => { kvReads++; return realKv.get(key); };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    (env as unknown as Record<string, unknown>).RL_SYNC_PAIR = { async limit() { return { success: false }; } };

    const res = await handleSync(
      new Request('http://x/sync/list/some-fake-syncid', {
        headers: { 'authorization': 'Bearer ' + toBase64Url(crypto.getRandomValues(new Uint8Array(32))) },
      }),
      env,
    );
    expect(res.status).toBe(429);
    expect(kvReads).toBe(0);
  });
});

describe('auth response indistinguishability', () => {
  it('unknown syncId with valid bearer returns 401, not 404', async () => {
    const env = makeEnv();
    const fakeBearer = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const res = await handleSync(
      new Request('http://x/sync/list/never-existed-syncid', {
        headers: { 'authorization': `Bearer ${fakeBearer}` },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ---------- R2-authoritative revisions (KV consistency redesign) ----------

describe('revision CAS on R2 (lost-update protection)', () => {
  it('ignores a stale KV mirror — R2 metadata is authoritative', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    await putDocAs(env, syncId, K_auth_b64, 'doc-1', 0); // revision 1
    await putDocAs(env, syncId, K_auth_b64, 'doc-1', 1); // revision 2

    // Simulate an eventually-consistent KV edge that still shows rev 1.
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, { value: string }> };
    kv._store.set(`meta:${syncId}:doc-1`, {
      value: JSON.stringify({ revision: 1, updatedAt: '2026-06-11T09:00:00Z' }),
    });

    // Old design: this push would pass the stale-KV check and silently
    // overwrite revision 2 (lost update). New design: 409.
    const res = await putDocAs(env, syncId, K_auth_b64, 'doc-1', 1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ currentRevision: 2 });
  });

  it('returns 409 with fresh revision when the conditional put loses a race', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    await putDocAs(env, syncId, K_auth_b64, 'doc-1', 0); // revision 1

    // Interleave a competing write between head and put: patch put to
    // first let a "rival" write land, restoring the real put afterwards.
    const r2 = env.INKMIRROR_SYNC_R2;
    const realPut = r2.put.bind(r2);
    let intercepted = false;
    (r2 as { put: typeof r2.put }).put = (async (key, body, opts) => {
      if (!intercepted) {
        intercepted = true;
        // Rival write bumps the object (new etag + revision 2)...
        await realPut(key, JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'rival' }), {
          customMetadata: { revision: '2', updatedAt: '2026-06-11T09:30:00Z' },
        });
        // ...then the original conditional put runs and must fail.
        return realPut(key, body, opts);
      }
      return realPut(key, body, opts);
    }) as typeof r2.put;

    const res = await putDocAs(env, syncId, K_auth_b64, 'doc-1', 1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ currentRevision: 2 });
  });

  it('migrates a legacy blob lazily: KV revision honored once, R2 metadata after the push', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // Legacy state: blob without customMetadata, revision only in KV.
    await env.INKMIRROR_SYNC_R2.put(
      `${syncId}/doc-old`,
      JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'old' }),
    );
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, { value: string }> };
    kv._store.set(`meta:${syncId}:doc-old`, {
      value: JSON.stringify({ revision: 7, updatedAt: '2026-04-27T13:00:00Z' }),
    });

    // GET serves the legacy revision from the mirror.
    const getRes = await handleSync(
      new Request(`http://x/sync/doc/${syncId}/doc-old`, {
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { revision: number }).revision).toBe(7);

    // Push against the legacy revision succeeds and migrates.
    const putRes = await putDocAs(env, syncId, K_auth_b64, 'doc-old', 7);
    expect(putRes.status).toBe(200);
    expect(((await putRes.json()) as { revision: number }).revision).toBe(8);

    const head = await env.INKMIRROR_SYNC_R2.head(`${syncId}/doc-old`);
    expect(head?.customMetadata?.revision).toBe('8');
  });

  it('deleteCircle removes blobs even when their KV mirror is missing (orphan cleanup)', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // Orphaned blob: exists in R2, no meta record (old partial-failure leftover).
    await env.INKMIRROR_SYNC_R2.put(
      `${syncId}/doc-orphan`,
      JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'orphan' }),
    );

    const res = await handleSync(
      new Request(`http://x/sync/circles/${syncId}`, {
        method: 'DELETE',
        headers: { 'authorization': `Bearer ${K_auth_b64}` },
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(await env.INKMIRROR_SYNC_R2.head(`${syncId}/doc-orphan`)).toBeNull();
    const kv = env.INKMIRROR_SYNC_KV as KVNamespace & { _store: Map<string, unknown> };
    expect(kv._store.has(`circle:${syncId}`)).toBe(false);
  });
});

// ---------- per-circle quotas ----------

describe('per-circle quotas', () => {
  it('rejects a NEW doc once the circle holds the max doc count', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // Seed the circle to the 100-doc cap directly in R2 (cheap, no auth loop).
    const r2 = env.INKMIRROR_SYNC_R2;
    for (let i = 0; i < 100; i++) {
      await r2.put(`${syncId}/seed-${i}`, JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'ct' }));
    }

    const res = await putDocAs(env, syncId, K_auth_b64, 'one-too-many', 0);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'doc_limit' });
  });

  it('still allows overwriting an EXISTING doc at the doc cap', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // 99 seeds + 1 real push = exactly at the cap.
    const r2 = env.INKMIRROR_SYNC_R2;
    for (let i = 0; i < 99; i++) {
      await r2.put(`${syncId}/seed-${i}`, JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'ct' }));
    }
    const first = await putDocAs(env, syncId, K_auth_b64, 'doc-real', 0);
    expect(first.status).toBe(200);

    // Overwrite must skip the quota scan and succeed.
    const overwrite = await putDocAs(env, syncId, K_auth_b64, 'doc-real', 1);
    expect(overwrite.status).toBe(200);
    expect(((await overwrite.json()) as { revision: number }).revision).toBe(2);
  });

  it('rejects a NEW doc that would push the circle past the byte cap', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    // One fake 200 MB object — sizeOverride avoids allocating the string.
    const r2 = env.INKMIRROR_SYNC_R2 as R2Bucket & { _store: Map<string, R2StubEntry> };
    await r2.put(`${syncId}/doc-fat`, JSON.stringify({ v: 1, iv: 'iv', ciphertext: 'ct' }));
    r2._store.get(`${syncId}/doc-fat`)!.sizeOverride = 200 * 1024 * 1024;

    const res = await putDocAs(env, syncId, K_auth_b64, 'doc-new', 0);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'storage_limit' });
  });
});

// ---------- path-segment length bounds ----------

describe('path-segment length bounds', () => {
  it('404s a syncId longer than 64 chars before any KV/R2 access', async () => {
    const env = makeEnv();
    const hugeSyncId = 'a'.repeat(65);
    const res = await handleSync(
      new Request(`http://x/sync/list/${hugeSyncId}`, {
        headers: { 'authorization': 'Bearer ' + toBase64Url(crypto.getRandomValues(new Uint8Array(32))) },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('404s a docId longer than 128 chars (route never matches)', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const hugeDocId = 'a'.repeat(129);
    // 404 (no route), NOT 401 — proof the request never reached the handler.
    const res = await handleSync(
      authedJsonRequest(`http://x/sync/doc/${syncId}/${hugeDocId}`, K_auth_b64, 'PUT', {
        v: 1, iv: 'iv', ciphertext: 'ct', expectedRevision: 0,
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it('accepts a UUID-shaped docId (the real client shape)', async () => {
    const env = makeEnv();
    const { syncId, K_auth_b64 } = await createCircle(env);
    const res = await putDocAs(env, syncId, K_auth_b64, crypto.randomUUID(), 0);
    expect(res.status).toBe(200);
  });
});
