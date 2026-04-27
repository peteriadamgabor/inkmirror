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
    async list() {
      return { keys: [], list_complete: true, cacheStatus: null };
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
