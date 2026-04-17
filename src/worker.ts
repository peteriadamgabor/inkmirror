/**
 * Cloudflare Worker entry point.
 *
 * Handles three things:
 *   1. /hf-proxy/* — proxy requests to HuggingFace with CORS headers
 *      added, so the in-browser Transformers.js can download models
 *      from a domain that (otherwise) doesn't send Access-Control-
 *      Allow-Origin for cross-origin fetches.
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

const FEEDBACK_MAX_MESSAGE = 4000;
const FEEDBACK_MAX_CONTACT = 200;

/** One submission per IP per 30s. Meaningful friction without a KV binding. */
const FEEDBACK_RATE_WINDOW_MS = 30_000;

interface FeedbackPayload {
  message?: unknown;
  contact?: unknown;
  /** Honeypot — should always be empty; bots fill every form field. */
  website?: unknown;
  /** Client clock at time of render; weak signal only (fully forgeable). */
  startedAt?: unknown;
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
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

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!env.DISCORD_WEBHOOK) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Feedback not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let payload: FeedbackPayload;
  try {
    payload = (await request.json()) as FeedbackPayload;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = clientIp(request);

  // Rate limit BEFORE any honeypot/startedAt check. Otherwise a fast
  // scripted loop that skips the honeypot field would pass through.
  if (await isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(FEEDBACK_RATE_WINDOW_MS / 1000)),
        },
      },
    );
  }

  // Honeypot — silent success so bots don't retry.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Too-fast submit — also silent success.
  if (typeof payload.startedAt === 'number') {
    const elapsed = Date.now() - payload.startedAt;
    if (elapsed < 2000) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const message =
    typeof payload.message === 'string' ? payload.message.trim() : '';
  const contact =
    typeof payload.contact === 'string' ? payload.contact.trim() : '';
  if (message.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Empty message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (message.length > FEEDBACK_MAX_MESSAGE) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Message too long' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (contact.length > FEEDBACK_MAX_CONTACT) {
    return new Response(JSON.stringify({ ok: false, error: 'Contact too long' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
    return new Response(
      JSON.stringify({ ok: false, error: 'Delivery failed' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // HuggingFace proxy route
    if (url.pathname.startsWith('/hf-proxy/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      const hfPath = url.pathname.slice('/hf-proxy/'.length);
      const hfUrl = `${HF_BASE}/${hfPath}${url.search}`;
      const hfResponse = await fetch(hfUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'InkMirror/1.0 (https://github.com/peteriadamgabor/inkmirror)',
        },
        redirect: 'follow',
      });
      const headers = new Headers(hfResponse.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');
      headers.set('Access-Control-Expose-Headers', '*');
      if (hfResponse.ok) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return new Response(hfResponse.body, {
        status: hfResponse.status,
        statusText: hfResponse.statusText,
        headers,
      });
    }

    // Feedback intake
    if (url.pathname === '/feedback') {
      return handleFeedback(request, env);
    }

    // Fall through to static assets (dist/*).
    return env.ASSETS.fetch(request);
  },
};
