import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
  createHandlerBoundToURL: vi.fn(() => async () => new Response('shell')),
}));
vi.mock('workbox-routing', () => ({
  registerRoute: vi.fn(),
  NavigationRoute: vi.fn(),
}));
vi.mock('workbox-strategies', () => ({
  CacheFirst: vi.fn(),
}));
vi.mock('workbox-expiration', () => ({
  ExpirationPlugin: vi.fn(),
}));

import { registerRoute, NavigationRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

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
  vi.mocked(registerRoute).mockClear();
  vi.mocked(NavigationRoute).mockClear();
  vi.mocked(createHandlerBoundToURL).mockClear();
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
      location: new URL('http://localhost/'),
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

/**
 * Wrap a real Request in a duck-typed object that overrides `mode` and
 * `Sec-Fetch-Site`. Node's undici rejects `mode: 'navigate'` in the
 * Request constructor and guards Sec-Fetch-* headers, so a genuine
 * share-sheet POST cannot be constructed directly in tests.
 */
function shareSheetRequest(
  req: Request,
  opts: { mode?: string; secFetchSite?: string | null } = {},
): Request {
  const headers = new Headers();
  req.headers.forEach((v, k) => headers.set(k, v));
  if (opts.secFetchSite !== undefined && opts.secFetchSite !== null) {
    headers.set('sec-fetch-site', opts.secFetchSite);
  }
  return {
    method: req.method,
    url: req.url,
    mode: opts.mode ?? 'navigate',
    headers,
    formData: () => req.formData(),
  } as unknown as Request;
}

function multipartShare(): Request {
  const file = new File(['{"kind":"inkmirror.document"}'], 'novel.inkmirror.json', {
    type: 'application/json',
  });
  const fd = new FormData();
  fd.append('files', file);
  return new Request('http://localhost/', { method: 'POST', body: fd });
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
    const result = await dispatchFetch(shareSheetRequest(req, { secFetchSite: 'none' }));
    expect(result?.status).toBe(303);
    expect(result?.headers.get('Location')).toMatch(/\/?$/);
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('stores file in cache and redirects to /?share=<uuid> for a navigate + Sec-Fetch-Site: none POST', async () => {
    const req = shareSheetRequest(multipartShare(), { secFetchSite: 'none' });

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
    expect(stored.headers.get('x-share-name')).toBeTruthy();
  });

  it('accepts navigate + Sec-Fetch-Site: same-origin', async () => {
    const req = shareSheetRequest(multipartShare(), { secFetchSite: 'same-origin' });
    const result = await dispatchFetch(req);
    expect(result?.status).toBe(303);
    expect(result?.headers.get('Location')).toMatch(/\/\?share=/);
    expect(mockCache.put).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-site posts — passes through to network, nothing stashed', async () => {
    const fetchMock = vi.fn(async () => new Response('passthrough'));
    vi.stubGlobal('fetch', fetchMock);
    const req = shareSheetRequest(multipartShare(), { secFetchSite: 'cross-site' });
    const result = await dispatchFetch(req);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await result?.text()).toBe('passthrough');
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('rejects posts with a missing Sec-Fetch-Site header (fail closed)', async () => {
    const fetchMock = vi.fn(async () => new Response('passthrough'));
    vi.stubGlobal('fetch', fetchMock);
    const req = shareSheetRequest(multipartShare(), { secFetchSite: null });
    const result = await dispatchFetch(req);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await result?.text()).toBe('passthrough');
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('rejects non-navigate posts even with Sec-Fetch-Site: none', async () => {
    const fetchMock = vi.fn(async () => new Response('passthrough'));
    vi.stubGlobal('fetch', fetchMock);
    const req = shareSheetRequest(multipartShare(), { mode: 'cors', secFetchSite: 'none' });
    await dispatchFetch(req);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('falls through to fetch() for non-multipart POST', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await dispatchFetch(
      shareSheetRequest(req, { secFetchSite: 'same-origin' }),
    );
    expect(result?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('isTrustedShareTarget', () => {
  it('accepts navigate + none (OS share sheet)', async () => {
    const sw = await import('./sw');
    expect(sw.isTrustedShareTarget('navigate', 'none')).toBe(true);
  });

  it('accepts navigate + same-origin', async () => {
    const sw = await import('./sw');
    expect(sw.isTrustedShareTarget('navigate', 'same-origin')).toBe(true);
  });

  it('rejects cross-site and same-site', async () => {
    const sw = await import('./sw');
    expect(sw.isTrustedShareTarget('navigate', 'cross-site')).toBe(false);
    expect(sw.isTrustedShareTarget('navigate', 'same-site')).toBe(false);
  });

  it('rejects a missing header (fail closed)', async () => {
    const sw = await import('./sw');
    expect(sw.isTrustedShareTarget('navigate', null)).toBe(false);
  });

  it('rejects non-navigate modes', async () => {
    const sw = await import('./sw');
    expect(sw.isTrustedShareTarget('cors', 'none')).toBe(false);
    expect(sw.isTrustedShareTarget('no-cors', 'same-origin')).toBe(false);
  });
});

describe('service worker runtime caching', () => {
  it('registers runtime routes for lazy assets, hf models, and the navigation fallback', () => {
    const calls = vi.mocked(registerRoute).mock.calls;
    // Two matcher-based routes + one NavigationRoute.
    expect(calls.length).toBe(3);
    expect(vi.mocked(NavigationRoute)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createHandlerBoundToURL)).toHaveBeenCalledWith('index.html');

    const matchers = calls
      .map((c) => c[0])
      .filter((m): m is (arg: { url: URL }) => boolean => typeof m === 'function');
    expect(matchers.length).toBe(2);
    const matchesAny = (url: string) =>
      matchers.some((m) => m({ url: new URL(url) }));
    expect(matchesAny('http://localhost/assets/ai-worker-abc123.js')).toBe(true);
    expect(matchesAny('http://localhost/hf-proxy/Xenova/model/resolve/main/onnx/model.onnx')).toBe(true);
    // Cross-origin and unrelated paths stay un-cached.
    expect(matchesAny('https://evil.example/assets/x.js')).toBe(false);
    expect(matchesAny('http://localhost/feedback')).toBe(false);
  });
});
