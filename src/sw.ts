/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

// ---------------------------------------------------------------------------
// Runtime caching — the heavy lazy chunks (ai-worker, ONNX wasm, jszip,
// jspdf, html2canvas, docx) are deliberately excluded from the precache
// manifest (globIgnores in vite.config.ts) so installs stay light. Without
// a runtime route they 404 offline and AI/exports break. CacheFirst is
// safe because every /assets/ filename carries a content hash.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'inkmirror-lazy-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// HF model files come through the same-origin /hf-proxy/ worker route.
// Caching them means sentiment analysis works offline after the first
// successful model download. Model files are immutable per revision.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/hf-proxy/'),
  new CacheFirst({
    cacheName: 'inkmirror-hf-models',
    plugins: [new ExpirationPlugin({ maxEntries: 20 })],
  }),
);

// Navigation fallback: deep routes (/landing, /roadmap, /privacy) are
// client-rendered from the same index.html, which IS in the precache
// (globPatterns includes **/*.html and Vite emits it as 'index.html').
// Without this, an offline navigation to /roadmap misses the precache
// and fails. NavigationRoute only matches GET requests with
// mode === 'navigate', so the share-target POST listener below is
// unaffected.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

/**
 * CSRF guard for the PWA share_target POST. Decides whether a `POST /`
 * is a genuine share-sheet invocation:
 *
 *  - OS share sheets launch the PWA with a top-level navigation and
 *    `Sec-Fetch-Site: none`.
 *  - A same-origin page (e.g. our own UI) posting to itself sends
 *    `Sec-Fetch-Site: same-origin`.
 *  - A malicious cross-site page auto-submitting a hidden form sends
 *    `Sec-Fetch-Site: cross-site` (or `same-site` from a sibling
 *    subdomain) — rejected, so it can't silently inject a document
 *    into the victim's library.
 *
 * A missing header fails closed: every modern browser that supports
 * service workers sends Sec-Fetch-Site, so its absence is suspicious.
 * Exported for unit tests.
 */
export function isTrustedShareTarget(
  mode: string,
  secFetchSite: string | null,
): boolean {
  if (mode !== 'navigate') return false;
  return secFetchSite === 'none' || secFetchSite === 'same-origin';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'POST') return;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.pathname !== '/') return;
  event.respondWith(handleShareTarget(request, url));
});

async function handleShareTarget(request: Request, url: URL): Promise<Response> {
  // CSRF guard — untrusted posts pass through to the network untouched;
  // nothing is stashed in the share inbox.
  if (!isTrustedShareTarget(request.mode, request.headers.get('sec-fetch-site'))) {
    return fetch(request);
  }
  const ct = request.headers.get('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) {
    return fetch(request);
  }
  const rootUrl = new URL('/', url).toString();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.redirect(rootUrl, 303);
  }
  const file = form.get('files');
  // Duck-type Blob/File: jsdom's FormData round-trip strips the prototype,
  // so `instanceof File` fails in tests even though the runtime object
  // exposes Blob's interface. Anything that's not a string and has a
  // numeric `size` we treat as a file payload.
  if (typeof file === 'string' || file === null) {
    return Response.redirect(rootUrl, 303);
  }
  const fileLike = file as Blob & { name?: string };
  if (typeof fileLike.size !== 'number' || fileLike.size === 0) {
    return Response.redirect(rootUrl, 303);
  }
  const id = crypto.randomUUID();
  const cache = await caches.open('inkmirror-share-inbox');
  await cache.put(
    new Request(new URL(`/__share/${id}`, url).toString()),
    new Response(fileLike, {
      headers: {
        'content-type': fileLike.type || 'application/json',
        'x-share-name': encodeURIComponent(fileLike.name || 'shared.json'),
      },
    }),
  );
  return Response.redirect(new URL(`/?share=${id}`, url).toString(), 303);
}
