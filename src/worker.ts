/**
 * Cloudflare Worker entry point.
 *
 * Handles three things:
 *   1. /hf-proxy/* — proxy requests to HuggingFace model-resolve URLs
 *      with CORS headers so the in-browser Transformers.js can download
 *      weights. The path is strictly validated against the HF
 *      `{org}/{model}/resolve/{rev}/{file}` shape — anything else is
 *      rejected, so the Worker cannot be used as a generic HuggingFace
 *      proxy or a CORS-bypass tool.
 *   2. /feedback — accept POSTed user feedback and forward it to a
 *      private Discord channel via webhook. Honeypot + length caps;
 *      no PII stored on our side.
 *   3. Everything else — fall through to the static asset serving
 *      configured via `assets.directory` in wrangler.jsonc.
 */

export interface Env {
  ASSETS: Fetcher;
  DISCORD_WEBHOOK?: string;
}

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

const FEEDBACK_MAX_MESSAGE = 4000;
const FEEDBACK_MAX_CONTACT = 200;
/** Hard cap on /feedback request body. Real payloads are well under 5 KB. */
const FEEDBACK_MAX_BODY_BYTES = 8192;

/** One submission per IP per 30s. Meaningful friction without a KV binding. */
const FEEDBACK_RATE_WINDOW_MS = 30_000;

/**
 * Content Security Policy applied to every response.
 *
 * - `script-src` + `'wasm-unsafe-eval'` lets Transformers.js compile its
 *   ONNX-runtime WASM. No `'unsafe-eval'` — we don't need arbitrary eval.
 * - `style-src 'unsafe-inline'` because Solid's `style={{ ... }}` emits
 *   inline `style="…"` attributes. No inline <style> injection surface
 *   because we don't use JSX-as-HTML anywhere; see the `marksToHtml`
 *   allowlist in src/engine/marks.ts.
 * - `connect-src 'self'` — HF proxy is same-origin. Direct HF requests
 *   from localhost dev happen before this CSP ships (dev bypasses the
 *   Worker entirely).
 * - `worker-src 'self' blob:` — Vite emits workers as blob URLs in some
 *   build modes; the ai-worker is a real module worker under 'self'.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  "worker-src 'self' blob:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none'; " +
  "form-action 'self'";

/** Baseline security headers applied to every Worker-generated response. */
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Frame-Options': 'DENY',
};

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BASE_SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

interface FeedbackPayload {
  message?: unknown;
  contact?: unknown;
  /** Honeypot — should always be empty; bots fill every form field. */
  website?: unknown;
  /** Client clock at time of render; weak signal only (fully forgeable). */
  startedAt?: unknown;
}

function clientIp(request: Request): string {
  const raw = request.headers.get('cf-connecting-ip') ?? '';
  // Defensive: only trust IPv4/IPv6 shapes. Anything else falls back.
  return /^[0-9a-fA-F:.]+$/.test(raw) && raw.length <= 45 ? raw : 'unknown';
}

// Isolate-local fast path. Cloudflare may spin up many isolates so this
// alone doesn't protect globally — the Cache API check below handles
// cross-isolate coverage.
const recentSubmits = new Map<string, number>();

/**
 * Returns true when this IP submitted within FEEDBACK_RATE_WINDOW_MS.
 * Uses in-memory + Cache API so the limit survives across isolates on
 * the same PoP. Best-effort, not strongly consistent.
 */
async function isRateLimited(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false; // don't penalize health checks / missing header
  const now = Date.now();
  const last = recentSubmits.get(ip);
  if (last && now - last < FEEDBACK_RATE_WINDOW_MS) return true;

  const cache = await caches.open('inkmirror-feedback-rl');
  const key = new Request(
    `https://rl.internal/feedback/${encodeURIComponent(ip)}`,
  );
  const hit = await cache.match(key);
  if (hit) return true;

  recentSubmits.set(ip, now);
  // Prune the in-memory map if it grows unreasonably large.
  if (recentSubmits.size > 1000) {
    for (const [k, t] of recentSubmits) {
      if (now - t > FEEDBACK_RATE_WINDOW_MS) recentSubmits.delete(k);
    }
  }

  await cache.put(
    key,
    new Response('1', {
      headers: {
        'Cache-Control': `max-age=${Math.ceil(FEEDBACK_RATE_WINDOW_MS / 1000)}`,
      },
    }),
  );
  return false;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...(init ?? {}),
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!env.DISCORD_WEBHOOK) {
    return jsonResponse({ ok: false, error: 'Feedback not configured' }, { status: 503 });
  }

  // Reject early on malformed content-type or missing/oversized body.
  // Cloudflare Workers will otherwise happily buffer the entire body
  // (up to ~100 MB) before we get a chance to validate.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ ok: false, error: 'Invalid content-type' }, { status: 415 });
  }
  const contentLengthRaw = request.headers.get('content-length');
  if (!contentLengthRaw) {
    return jsonResponse({ ok: false, error: 'Missing content-length' }, { status: 411 });
  }
  const contentLength = Number(contentLengthRaw);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return jsonResponse({ ok: false, error: 'Invalid content-length' }, { status: 400 });
  }
  if (contentLength > FEEDBACK_MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: 'Payload too large' }, { status: 413 });
  }

  let payload: FeedbackPayload;
  try {
    payload = (await request.json()) as FeedbackPayload;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const ip = clientIp(request);

  // Rate limit BEFORE any honeypot/startedAt check. Otherwise a fast
  // scripted loop that skips the honeypot field would pass through.
  if (await isRateLimited(ip)) {
    return jsonResponse(
      { ok: false, error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(FEEDBACK_RATE_WINDOW_MS / 1000)),
        },
      },
    );
  }

  // Honeypot — silent success so bots don't retry.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return jsonResponse({ ok: true }, { status: 200 });
  }

  // Too-fast submit — also silent success.
  if (typeof payload.startedAt === 'number') {
    const elapsed = Date.now() - payload.startedAt;
    if (elapsed < 2000) {
      return jsonResponse({ ok: true }, { status: 200 });
    }
  }

  const message =
    typeof payload.message === 'string' ? payload.message.trim() : '';
  const contact =
    typeof payload.contact === 'string' ? payload.contact.trim() : '';
  if (message.length === 0) {
    return jsonResponse({ ok: false, error: 'Empty message' }, { status: 400 });
  }
  if (message.length > FEEDBACK_MAX_MESSAGE) {
    return jsonResponse({ ok: false, error: 'Message too long' }, { status: 400 });
  }
  if (contact.length > FEEDBACK_MAX_CONTACT) {
    return jsonResponse({ ok: false, error: 'Contact too long' }, { status: 400 });
  }

  const ua = request.headers.get('user-agent') ?? 'unknown';
  const ref = request.headers.get('referer') ?? 'unknown';

  // IP is used for rate limiting (above) but NOT forwarded to Discord
  // — keeping it out matches the privacy copy in README.md.
  const discordBody = {
    // Plain content kept short; details go in an embed.
    content: '**New InkMirror feedback**',
    embeds: [
      {
        description: message.slice(0, FEEDBACK_MAX_MESSAGE),
        color: 0x7f77dd,
        fields: [
          { name: 'Contact', value: contact || '_not provided_', inline: false },
          { name: 'Referer', value: ref, inline: false },
          { name: 'User-Agent', value: ua.slice(0, 512), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
    // Don't ping anyone on submissions.
    allowed_mentions: { parse: [] as string[] },
  };

  const discordResp = await fetch(env.DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordBody),
  });

  if (!discordResp.ok) {
    // Log enough to debug later without echoing the user's content back.
    const text = await discordResp.text().catch(() => '');
    console.error(
      `[feedback] discord webhook failed status=${discordResp.status} body=${text.slice(0, 200)}`,
    );
    return jsonResponse({ ok: false, error: 'Delivery failed' }, { status: 502 });
  }

  return jsonResponse({ ok: true }, { status: 200 });
}

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

async function handleHfProxy(request: Request): Promise<Response> {
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
      // `manual` keeps us from following a redirect to a non-HF host. If
      // HF returns 30x, we pass it through so the client can re-request
      // via the proxy (which will validate the new path again).
      redirect: 'manual',
    });
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(corsHeaders({ origin }))) {
    headers.set(k, v);
  }
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  if (upstream.status >= 300 && upstream.status < 400) {
    // Don't leak upstream redirect target — force the client back
    // through the proxy with the resolved model path if needed.
    const loc = upstream.headers.get('location');
    if (loc && loc.startsWith(`${HF_BASE}/`)) {
      const hfPath = loc.slice(HF_BASE.length + 1);
      if (HF_PATH_RE.test(hfPath)) {
        headers.set('Location', `/hf-proxy/${hfPath}`);
        return new Response(null, { status: upstream.status, headers });
      }
    }
    return new Response('Not found', { status: 404 });
  }

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/hf-proxy/')) {
      return withSecurityHeaders(await handleHfProxy(request));
    }

    if (url.pathname === '/feedback') {
      return withSecurityHeaders(await handleFeedback(request, env));
    }

    // Static assets — let the asset Fetcher answer, then layer headers on top.
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
