import type { Env } from './types';
import { generatePaircode, constantTimeEqualBytes } from '../sync/crypto';

const PAIRCODE_TTL_SECONDS = 120;
const PAIRCODE_REGEX = /^[A-HJKMNP-Z2-9]{6}$/;

export async function handleSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'POST' && path === '/sync/circles') {
    return await postCircle(request, env);
  }

  if (method === 'POST' && path === '/sync/pair/redeem') {
    return await postPairRedeem(request, env);
  }

  // /sync/circles/:syncId/paircode
  const paircodeMatch = path.match(/^\/sync\/circles\/([A-Za-z0-9_-]+)\/paircode$/);
  if (paircodeMatch && method === 'POST') {
    return await postIssuePaircode(request, env, paircodeMatch[1]);
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

// --- auth helper ---

type AuthOk = { ok: true; circle: { salt: string; auth_proof: string; createdAt: string } };
type AuthFail = { ok: false; res: Response };

async function authenticateCircle(
  request: Request,
  env: Env,
  syncId: string,
): Promise<AuthOk | AuthFail> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, res: jsonError(401, 'missing_auth') };
  }
  const K_auth_b64 = auth.slice('Bearer '.length).trim();
  let K_auth: Uint8Array;
  try { K_auth = fromBase64UrlBytes(K_auth_b64); }
  catch { return { ok: false, res: jsonError(401, 'malformed_auth') }; }
  if (K_auth.length !== 32) return { ok: false, res: jsonError(401, 'malformed_auth') };

  const raw = await env.INKMIRROR_SYNC_KV.get(`circle:${syncId}`);
  if (!raw) return { ok: false, res: jsonError(404, 'unknown_circle') };
  const circle = JSON.parse(raw) as { salt: string; auth_proof: string; createdAt: string };

  const proofBuf = await crypto.subtle.digest(
    'SHA-256',
    K_auth.buffer.slice(K_auth.byteOffset, K_auth.byteOffset + K_auth.byteLength) as ArrayBuffer,
  );
  const proof = new Uint8Array(proofBuf);
  const stored = fromBase64UrlBytes(circle.auth_proof);
  if (!constantTimeEqualBytes(proof, stored)) {
    return { ok: false, res: jsonError(401, 'auth_mismatch') };
  }
  return { ok: true, circle };
}

// --- new handlers ---

async function postIssuePaircode(request: Request, env: Env, syncId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;

  const paircode = generatePaircode();
  const expiresAt = new Date(Date.now() + PAIRCODE_TTL_SECONDS * 1000).toISOString();

  await env.INKMIRROR_SYNC_KV.put(
    `paircode:${paircode}`,
    JSON.stringify({ syncId, expiresAt }),
    { expirationTtl: PAIRCODE_TTL_SECONDS },
  );

  return Response.json({ paircode, expiresAt }, { status: 200 });
}

async function postPairRedeem(request: Request, env: Env): Promise<Response> {
  const body = await safeJson(request);
  if (!body || typeof body.paircode !== 'string') return jsonError(400, 'invalid_body');
  if (!PAIRCODE_REGEX.test(body.paircode)) return jsonError(410, 'invalid_paircode');

  const key = `paircode:${body.paircode}`;
  const raw = await env.INKMIRROR_SYNC_KV.get(key);
  if (!raw) return jsonError(410, 'paircode_expired');
  // Single-use: delete on read.
  await env.INKMIRROR_SYNC_KV.delete(key);

  const { syncId } = JSON.parse(raw) as { syncId: string };
  const circleRaw = await env.INKMIRROR_SYNC_KV.get(`circle:${syncId}`);
  if (!circleRaw) return jsonError(410, 'circle_gone');
  const { salt } = JSON.parse(circleRaw) as { salt: string };

  return Response.json({ syncId, salt }, { status: 200 });
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
