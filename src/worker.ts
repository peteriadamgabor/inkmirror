/**
 * Cloudflare Worker entry point.
 *
 * Handles two things:
 *   1. /hf-proxy/* — proxy requests to HuggingFace with CORS headers
 *      added, so the in-browser Transformers.js can download models
 *      from a domain that (otherwise) doesn't send Access-Control-
 *      Allow-Origin for cross-origin fetches.
 *   2. Everything else — fall through to the static asset serving
 *      configured via `assets.directory` in wrangler.jsonc.
 */

export interface Env {
  ASSETS: Fetcher;
}

const HF_BASE = 'https://huggingface.co';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // HuggingFace proxy route
    if (url.pathname.startsWith('/hf-proxy/')) {
      const hfPath = url.pathname.slice('/hf-proxy/'.length);
      const hfUrl = `${HF_BASE}/${hfPath}${url.search}`;

      // Forward the request to HuggingFace, follow redirects.
      const hfResponse = await fetch(hfUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'InkMirror/1.0 (https://github.com/peteriadamgabor/inkmirror)',
        },
        redirect: 'follow',
      });

      // Mirror the response with CORS headers added.
      const headers = new Headers(hfResponse.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');
      headers.set('Access-Control-Expose-Headers', '*');
      // Cache model files aggressively — they're immutable.
      if (hfResponse.ok) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }

      return new Response(hfResponse.body, {
        status: hfResponse.status,
        statusText: hfResponse.statusText,
        headers,
      });
    }

    // Preflight for the proxy route
    if (url.pathname.startsWith('/hf-proxy/') && request.method === 'OPTIONS') {
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

    // Fall through to static assets (dist/*).
    return env.ASSETS.fetch(request);
  },
};
