import type { Env } from './types';

const FEEDBACK_MAX_MESSAGE = 4000;
const FEEDBACK_MAX_CONTACT = 200;
/** Hard cap on /feedback request body. Real payloads are well under 5 KB. */
const FEEDBACK_MAX_BODY_BYTES = 8192;

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

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
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
