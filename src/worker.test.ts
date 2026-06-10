// @vitest-environment node
import { describe, it, expect } from 'vitest';
import worker from './worker';
import type { Env } from './worker/types';

/**
 * ASSETS stub that mirrors Cloudflare's static-asset behavior with the
 * default `html_handling: "auto-trailing-slash"`:
 *   - `/` serves index.html with 200
 *   - `/index.html` is NORMALIZED to `/` via a 307 redirect (this is the
 *     exact behavior that caused the production landing-page redirect
 *     loop — the Worker passed the 307 through to the browser)
 *   - known asset paths serve with 200
 *   - everything else 404s (not_found_handling: "none")
 */
const SHELL = '<!doctype html><html><body>inkmirror shell</body></html>';

function makeAssetsStub(): Fetcher {
  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/') {
        return new Response(SHELL, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/index.html') {
        return new Response(null, { status: 307, headers: { location: '/' } });
      }
      if (url.pathname === '/assets/app.js') {
        return new Response('// js', {
          status: 200,
          headers: { 'content-type': 'text/javascript' },
        });
      }
      return new Response('Not Found', { status: 404 });
    },
  } as unknown as Fetcher;
}

function makeEnv(): Env {
  return { ASSETS: makeAssetsStub() } as unknown as Env;
}

function get(path: string): Request {
  // Incoming Worker requests arrive with redirect mode "manual" — part of
  // why the 307 leaked through instead of being followed internally.
  return new Request(`https://inkmirror.cc${path}`, { redirect: 'manual' });
}

describe('worker SPA route serving', () => {
  it.each(['/', '/landing', '/roadmap', '/privacy', '/perf'])(
    'serves the shell with 200 (no redirect) for %s',
    async (path) => {
      const res = await worker.fetch(get(path), makeEnv());
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(await res.text()).toContain('inkmirror shell');
    },
  );

  it('serves the styled shell with 404 status for path-shaped unknown URLs', async () => {
    const res = await worker.fetch(get('/some/typo'), makeEnv());
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('inkmirror shell');
  });

  it('serves a cheap text 404 for file-shaped probe URLs', async () => {
    const res = await worker.fetch(get('/wp-login.php'), makeEnv());
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('inkmirror shell');
  });

  it('passes real assets through untouched', async () => {
    const res = await worker.fetch(get('/assets/app.js'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('// js');
  });
});
