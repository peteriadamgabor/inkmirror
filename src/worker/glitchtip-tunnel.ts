import type { Env } from './types';

/**
 * GlitchTip ingest tunnel.
 *
 * The browser's Sentry SDK runs with `tunnel: '/glitchtip-tunnel'`, so it
 * POSTs every envelope to THIS same-origin path instead of straight to the
 * GlitchTip host. That buys two things a direct browser→GlitchTip request
 * can't have:
 *
 *   1. No CORS. A direct cross-origin POST carrying a custom auth header
 *      (`X-NetBird-Auth`) triggers a preflight OPTIONS — and browsers never
 *      attach custom headers to a preflight, so the NetBird proxy 401s it and
 *      the real POST never fires. Same-origin → no preflight → no problem.
 *   2. The proxy secret stays server-side. We inject the NetBird auth header
 *      here, from a runtime Worker Secret (`GLITCHTIP_PROXY_AUTH_VALUE`), so
 *      it never ships in the browser bundle.
 *
 * The upstream target is derived from the `dsn` field in the envelope's first
 * line (Sentry's envelope header). We pin the host to ALLOWED_HOST so this
 * route can't be turned into an open proxy.
 */

const ALLOWED_HOST = 'glitchtip.peteriadamgabor.com';

/** Crash envelopes are a few KB; reject anything that smells like a minidump. */
const MAX_ENVELOPE_BYTES = 100_000;

export async function handleGlitchTipTunnel(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > MAX_ENVELOPE_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  const body = await request.text();
  if (body.length > MAX_ENVELOPE_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  // The envelope's first line is a JSON header carrying the DSN.
  const firstNewline = body.indexOf('\n');
  if (firstNewline === -1) {
    return new Response('Malformed envelope', { status: 400 });
  }

  let dsnHost: string;
  let projectId: string;
  try {
    const header = JSON.parse(body.slice(0, firstNewline)) as { dsn?: unknown };
    if (typeof header.dsn !== 'string') {
      return new Response('Missing DSN', { status: 400 });
    }
    const dsn = new URL(header.dsn);
    dsnHost = dsn.hostname;
    projectId = dsn.pathname.replace(/\//g, '');
  } catch {
    return new Response('Bad envelope header', { status: 400 });
  }

  if (dsnHost !== ALLOWED_HOST || !/^\d+$/.test(projectId)) {
    return new Response('Forbidden', { status: 403 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-sentry-envelope',
  };
  if (env.GLITCHTIP_PROXY_AUTH_VALUE) {
    const headerName = env.GLITCHTIP_PROXY_AUTH_HEADER || 'X-NetBird-Auth';
    headers[headerName] = env.GLITCHTIP_PROXY_AUTH_VALUE;
  }

  const upstream = `https://${ALLOWED_HOST}/api/${projectId}/envelope/`;
  const resp = await fetch(upstream, { method: 'POST', headers, body });

  // Pass the status back so the SDK can log delivery failures; drop the
  // body (GlitchTip's ingest response is uninteresting to the client).
  return new Response(null, { status: resp.status });
}
