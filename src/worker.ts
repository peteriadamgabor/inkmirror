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
 *   3. Everything else — fall through to the static asset serving
 *      configured via `assets.directory` in wrangler.jsonc.
 *
 * Every response is wrapped with the baseline security headers /
 * CSP defined in ./worker/security-headers.ts.
 */

import { withSecurityHeaders } from './worker/security-headers';
import { handleHfProxy } from './worker/hf-proxy';
import { handleFeedback } from './worker/feedback';
import type { Env } from './worker/types';

export type { Env };

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
