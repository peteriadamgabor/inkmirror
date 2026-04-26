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

export function withSecurityHeaders(res: Response): Response {
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
