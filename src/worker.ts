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

interface FeedbackPayload {
  message?: unknown;
  contact?: unknown;
  /** Honeypot — should always be empty; bots fill every form field. */
  website?: unknown;
  /** Client clock at time of render; we reject sub-2s submits (bots). */
  startedAt?: unknown;
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
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
  const ip = clientIp(request);
  const ref = request.headers.get('referer') ?? 'unknown';

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
          { name: 'IP', value: ip, inline: true },
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
