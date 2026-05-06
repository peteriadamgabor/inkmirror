/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

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
