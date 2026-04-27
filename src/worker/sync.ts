import type { Env } from './types';

export async function handleSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'POST' && path === '/sync/circles') {
    return await postCircle(request, env);
  }
  return new Response('Not Found', { status: 404 });
}

async function postCircle(request: Request, env: Env): Promise<Response> {
  const body = await safeJson(request);
  if (!body) return jsonError(400, 'invalid_body');

  const auth_proof = decodeOrNull(body.auth_proof, 32);
  const salt       = decodeOrNull(body.salt,       16);
  if (!auth_proof || !salt) return jsonError(400, 'malformed_inputs');

  // Generate a 16-byte syncId (128 bits, base64url, no padding).
  const syncIdBytes = crypto.getRandomValues(new Uint8Array(16));
  const syncId = toBase64UrlBytes(syncIdBytes);

  await env.INKMIRROR_SYNC_KV.put(
    `circle:${syncId}`,
    JSON.stringify({
      salt: body.salt,
      auth_proof: body.auth_proof,
      createdAt: new Date().toISOString(),
    }),
  );

  return Response.json({ syncId }, { status: 201 });
}

// --- helpers ---

async function safeJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch { return null; }
}

function decodeOrNull(s: unknown, expectedLength: number): Uint8Array | null {
  if (typeof s !== 'string') return null;
  try {
    const bytes = fromBase64UrlBytes(s);
    if (bytes.length !== expectedLength) return null;
    return bytes;
  } catch { return null; }
}

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

// Local base64url helpers — intentionally not imported from src/sync/crypto
// to keep the worker bundle independent of the client-side crypto module.

function toBase64UrlBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64UrlBytes(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
