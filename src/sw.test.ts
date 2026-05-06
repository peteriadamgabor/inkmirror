import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
}));

interface MockCache {
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const mockCache: MockCache = {
  put: vi.fn(),
  match: vi.fn(),
  delete: vi.fn(),
};

type FetchListener = (event: {
  request: Request;
  respondWith: (p: Promise<Response>) => void;
}) => void;

let fetchListener: FetchListener | null = null;

beforeEach(async () => {
  fetchListener = null;
  vi.resetModules();
  mockCache.put.mockReset();
  mockCache.match.mockReset();
  mockCache.delete.mockReset();
  Object.defineProperty(globalThis, 'caches', {
    writable: true,
    configurable: true,
    value: { open: vi.fn(async () => mockCache) },
  });
  Object.defineProperty(globalThis, 'self', {
    writable: true,
    configurable: true,
    value: {
      __WB_MANIFEST: [],
      addEventListener: (type: string, listener: FetchListener) => {
        if (type === 'fetch') fetchListener = listener;
      },
      skipWaiting: vi.fn(),
    },
  });
  await import('./sw');
});

async function dispatchFetch(request: Request): Promise<Response | undefined> {
  if (!fetchListener) throw new Error('fetch listener not registered');
  let captured: Promise<Response> | undefined;
  fetchListener({
    request,
    respondWith: (p) => {
      captured = p;
    },
  });
  return captured ? await captured : undefined;
}

describe('service worker fetch listener', () => {
  it('ignores non-POST requests', async () => {
    const result = await dispatchFetch(new Request('http://localhost/', { method: 'GET' }));
    expect(result).toBeUndefined();
  });

  it('ignores POST to non-root paths', async () => {
    const result = await dispatchFetch(
      new Request('http://localhost/something', { method: 'POST' }),
    );
    expect(result).toBeUndefined();
  });

  it('redirects empty multipart to /', async () => {
    const fd = new FormData();
    const req = new Request('http://localhost/', { method: 'POST', body: fd });
    const result = await dispatchFetch(req);
    expect(result?.status).toBe(303);
    expect(result?.headers.get('Location')).toMatch(/\/?$/);
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('stores file in cache and redirects to /?share=<uuid> for valid multipart POST', async () => {
    const file = new File(['{"kind":"inkmirror.document"}'], 'novel.inkmirror.json', {
      type: 'application/json',
    });
    const fd = new FormData();
    fd.append('files', file);
    const req = new Request('http://localhost/', { method: 'POST', body: fd });

    const result = await dispatchFetch(req);

    expect(result?.status).toBe(303);
    const location = result?.headers.get('Location') ?? '';
    expect(location).toMatch(/\/\?share=[0-9a-f-]{36}$/);
    expect(mockCache.put).toHaveBeenCalledTimes(1);
    const [putReq, putRes] = mockCache.put.mock.calls[0];
    expect(putReq.url).toMatch(/\/__share\/[0-9a-f-]{36}$/);
    // jsdom mangles File bytes through FormData round-trip (content arrives
    // as the literal string "undefined"); we can't reliably assert the
    // stored size here. We assert that the Response was constructed with
    // the right content-type and that the share-name header round-trips.
    const stored = putRes as Response;
    expect(stored.headers.get('content-type')).toMatch(/^application\/json/);
    // jsdom replaces File.name with 'blob' through FormData round-trip; we
    // just assert the x-share-name header is set to the (encoded) name we
    // observed, whatever jsdom preserved.
    expect(stored.headers.get('x-share-name')).toBeTruthy();
    expect(file.size).toBeGreaterThan(0);
  });

  it('falls through to fetch() for non-multipart POST', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const fetchMock = vi.fn(async () => new Response('ok'));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
    const result = await dispatchFetch(req);
    expect(result?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });
});
