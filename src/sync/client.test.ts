// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncClient, SyncHttpError } from './client';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('SyncClient', () => {
  it('attaches Bearer K_auth on authenticated requests', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    await client.list('sync-id-1');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('authorization')).toMatch(/^Bearer [A-Za-z0-9_-]+$/);
  });

  it('throws SyncHttpError with status code on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"auth_mismatch"}', { status: 401, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    await expect(client.list('sync-id-1')).rejects.toMatchObject({ name: 'SyncHttpError', status: 401 });
  });

  it('parses 409 conflict body for putDoc', async () => {
    fetchMock.mockResolvedValue(new Response('{"currentRevision":7}', { status: 409, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    try {
      await client.putDoc('s', 'd', { v: 1, iv: 'A', ciphertext: 'B', expectedRevision: 0 });
      throw new Error('should have thrown');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(SyncHttpError);
      const err = e as SyncHttpError;
      expect(err.status).toBe(409);
      expect(err.body).toEqual({ currentRevision: 7 });
    }
  });

  it('createCircle does not send Authorization header', async () => {
    fetchMock.mockResolvedValue(new Response('{"syncId":"abc"}', { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    await client.createCircle({ auth_proof_b64: 'ap', salt_b64: 'sa' });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('authorization')).toBeNull();
  });

  it('redeemPaircode does not send Authorization header', async () => {
    fetchMock.mockResolvedValue(new Response('{"syncId":"abc","salt":"sa"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    await client.redeemPaircode('ABCDEF');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('authorization')).toBeNull();
  });

  it('deleteDoc returns void on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = createSyncClient({ baseUrl: 'http://x', K_auth: new Uint8Array(32) });
    const res = await client.deleteDoc('s', 'd');
    expect(res).toBeUndefined();
  });

  it('builds URLs by concatenating baseUrl + path', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createSyncClient({ baseUrl: 'http://example', K_auth: new Uint8Array(32) });
    await client.list('sync-id-1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://example/sync/list/sync-id-1');
  });
});
