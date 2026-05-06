/**
 * Cloudflare Worker entry point.
 *
 * Routes:
 *   1. /hf-proxy/* — proxy requests to HuggingFace model-resolve URLs
 *      with CORS headers so the in-browser Transformers.js can download
 *      weights. The path is strictly validated against the HF
 *      `{org}/{model}/resolve/{rev}/{file}` shape — anything else is
 *      rejected, so the Worker cannot be used as a generic HuggingFace
 *      proxy or a CORS-bypass tool. (See ./worker/hf-proxy.ts)
 *   2. /feedback — accept POSTed user feedback and forward it to a
 *      private Discord channel via webhook. Honeypot + length caps;
 *      no PII stored on our side. (See ./worker/feedback.ts)
 *   3. /sync/* — opt-in E2E-encrypted sync (KV + R2). (See ./worker/sync.ts)
 *   4. Known SPA routes — explicitly serve /index.html so the client
 *      router can mount. With `not_found_handling: "none"` set in
 *      wrangler, ASSETS no longer rewrites unknown paths to index.html
 *      automatically; the Worker owns that decision now.
 *   5. File-extensioned paths that don't exist (probes like /wp-login.php,
 *      /.env, /admin.php) — fast 404, no body. Bots stop wasting our
 *      bandwidth and our logs stay quiet.
 *   6. Path-shaped unknown URLs (/foo, /typo/bar) — serve the SPA shell
 *      with HTTP 404 status. Browsers see the styled NotFoundRoute,
 *      crawlers see a real 404 and back off.
 *
 * Every response is wrapped with the baseline security headers /
 * CSP defined in ./worker/security-headers.ts.
 */

import { withSecurityHeaders } from './worker/security-headers';
import { handleHfProxy } from './worker/hf-proxy';
import { handleFeedback } from './worker/feedback';
import { handleSync } from './worker/sync';
import type { Env } from './worker/types';

export type { Env };

/** Routes the SPA mounts. Must stay in sync with KNOWN_PATHS in src/index.tsx. */
const SPA_ROUTES = new Set<string>(['/', '/landing', '/roadmap', '/privacy', '/perf']);

/** Cheap 404 for paths that exist only because someone is poking for vulns. */
const NOT_FOUND_404 = (): Response =>
  new Response('Not Found', {
    status: 404,
    headers: { 'cache-control': 'public, max-age=300', 'content-type': 'text/plain' },
  });

/** True if the path looks like a file (has an extension after the last `/`). */
function isFilePath(pathname: string): boolean {
  return /\.[a-zA-Z0-9]{1,5}$/.test(pathname);
}

async function serveIndex(request: Request, env: Env, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const indexReq = new Request(new URL('/index.html', url.origin), request);
  const res = await env.ASSETS.fetch(indexReq);
  if (status === 200) return res;
  // Replay the body with the desired status (404 for unknown paths so
  // crawlers see the truth while browsers still get the styled shell).
  return new Response(res.body, {
    status,
    statusText: 'Not Found',
    headers: res.headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/hf-proxy/')) {
      return withSecurityHeaders(await handleHfProxy(request));
    }

    if (path === '/feedback') {
      return withSecurityHeaders(await handleFeedback(request, env));
    }

    if (path.startsWith('/sync/')) {
      return withSecurityHeaders(await handleSync(request, env));
    }

    // SPA routes → serve index.html with status 200.
    if (SPA_ROUTES.has(path)) {
      return withSecurityHeaders(await serveIndex(request, env, 200));
    }

    // Try the asset fetcher. With SPA mode disabled, missing files
    // legitimately return 404 instead of being rewritten to index.html.
    const assetRes = await env.ASSETS.fetch(request);

    if (assetRes.status !== 404) {
      return withSecurityHeaders(assetRes);
    }

    // Asset fetcher 404'd. Two flavours of 404:
    //   - File-shaped (/wp-login.php, /favicon.ico typos): cheap text 404.
    //     These are almost always probes; no point burning bytes on a
    //     full HTML shell.
    //   - Path-shaped (/whatever): styled SPA shell with 404 status, so a
    //     human typo lands on the branded NotFoundRoute.
    if (isFilePath(path)) {
      return withSecurityHeaders(NOT_FOUND_404());
    }
    return withSecurityHeaders(await serveIndex(request, env, 404));
  },
};
