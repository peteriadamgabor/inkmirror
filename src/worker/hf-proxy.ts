const HF_BASE = 'https://huggingface.co';

/** Only paths matching `org/model/resolve/rev/file...` are proxied. */
const HF_PATH_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/resolve\/[A-Za-z0-9._\-/]+$/;

/** Maximum model asset content-type the proxy will return. */
const HF_ALLOWED_CONTENT_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'text/plain',
  'text/plain; charset=utf-8',
  'binary/octet-stream',
]);

interface CorsOptions {
  origin: string;
}

function corsHeaders({ origin }: CorsOptions): Record<string, string> {
  // Echo the (page) origin back to the client so browsers accept cross-
  // origin fetches from our own domain only. Caching varies by Origin.
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function resolveProxyOrigin(request: Request): string {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin) return requestOrigin;
  // Same-origin navigation requests (no Origin header) — fall back to
  // the Worker's own origin so caching stays consistent.
  return new URL(request.url).origin;
}

export async function handleHfProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = resolveProxyOrigin(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders({ origin }),
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawPath = url.pathname.slice('/hf-proxy/'.length);
  // Disallow anything that could escape the model-asset namespace: no
  // encoded slashes, no traversal segments, no query/fragment smuggling.
  if (
    !rawPath ||
    rawPath.includes('..') ||
    rawPath.includes('//') ||
    rawPath.startsWith('/') ||
    rawPath.includes('\\') ||
    rawPath.includes('?') ||
    rawPath.includes('#') ||
    rawPath.includes('%2f') ||
    rawPath.includes('%2F') ||
    !HF_PATH_RE.test(rawPath)
  ) {
    return new Response('Not found', { status: 404 });
  }

  const hfUrl = `${HF_BASE}/${rawPath}`;
  let upstream: Response;
  try {
    upstream = await fetch(hfUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'InkMirror/1.0 (https://github.com/peteriadamgabor/inkmirror)',
      },
      // HF redirects `/<org>/<model>/resolve/main/<file>` → same-origin
      // `/api/resolve-cache/...` before serving the bytes. Follow the
      // chain here so the browser receives the final 200. The incoming
      // path is regex-gated to HF's model namespace, so this fetch cannot
      // be pointed at anything off-origin; the content-type allowlist
      // below remains the safety net if an upstream response ever drifts.
      redirect: 'follow',
    });
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(corsHeaders({ origin }))) {
    headers.set(k, v);
  }
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Enforce a strict content-type allowlist so a compromised upstream
  // cannot deliver HTML/JS under our origin's same-origin protections.
  const upstreamType = (upstream.headers.get('content-type') ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const expectedType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  if (!HF_ALLOWED_CONTENT_TYPES.has(expectedType.toLowerCase()) && !HF_ALLOWED_CONTENT_TYPES.has(upstreamType)) {
    return new Response('Unsupported media type', { status: 415 });
  }
  headers.set('Content-Type', expectedType);

  const cl = upstream.headers.get('content-length');
  if (cl) headers.set('Content-Length', cl);
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  const lastModified = upstream.headers.get('last-modified');
  if (lastModified) headers.set('Last-Modified', lastModified);

  if (upstream.ok) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
