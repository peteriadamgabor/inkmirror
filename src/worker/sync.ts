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

  // /sync/list/:syncId
  const listMatch = path.match(/^\/sync\/list\/([A-Za-z0-9_-]+)$/);
  if (listMatch && method === 'GET') {
    return await getList(request, env, listMatch[1]);
  }

  // /sync/doc/:syncId/:docId
  const docMatch = path.match(/^\/sync\/doc\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
  if (docMatch) {
    const [, syncId, docId] = docMatch;
    if (method === 'PUT')    return await putDoc(request, env, syncId, docId);
    if (method === 'GET')    return await getDoc(request, env, syncId, docId);
    if (method === 'DELETE') return await deleteDoc(request, env, syncId, docId);
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

const MAX_BLOB_BYTES = 10 * 1024 * 1024; // 10 MB

async function putDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;

  const text = await request.text();
  if (text.length > MAX_BLOB_BYTES + 1024) return jsonError(413, 'too_large');

  let body: { v?: number; iv?: string; ciphertext?: string; expectedRevision?: number };
  try { body = JSON.parse(text); } catch { return jsonError(400, 'invalid_body'); }

  if (body.v !== 1) return jsonError(400, 'unsupported_v');
  if (typeof body.iv !== 'string' || typeof body.ciphertext !== 'string') return jsonError(400, 'invalid_body');
  if (typeof body.expectedRevision !== 'number') return jsonError(400, 'invalid_body');
  if (body.ciphertext.length > MAX_BLOB_BYTES) return jsonError(413, 'too_large');

  const metaKey = `meta:${syncId}:${docId}`;
  const rawMeta = await env.INKMIRROR_SYNC_KV.get(metaKey);
  const currentRevision = rawMeta ? (JSON.parse(rawMeta) as { revision: number }).revision : 0;

  if (body.expectedRevision !== currentRevision) {
    return Response.json({ currentRevision }, { status: 409 });
  }

  const newRevision = currentRevision + 1;
  const updatedAt = new Date().toISOString();
  const blob = JSON.stringify({ v: body.v, iv: body.iv, ciphertext: body.ciphertext });

  await env.INKMIRROR_SYNC_R2.put(`${syncId}/${docId}`, blob, {
    httpMetadata: { contentType: 'application/json' },
  });
  await env.INKMIRROR_SYNC_KV.put(metaKey, JSON.stringify({ revision: newRevision, updatedAt }));

  return Response.json({ revision: newRevision, updatedAt }, { status: 200 });
}

async function getDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;

  const metaKey = `meta:${syncId}:${docId}`;
  const rawMeta = await env.INKMIRROR_SYNC_KV.get(metaKey);
  if (!rawMeta) return jsonError(404, 'doc_missing');
  const meta = JSON.parse(rawMeta) as { revision: number; updatedAt: string };

  const r2obj = await env.INKMIRROR_SYNC_R2.get(`${syncId}/${docId}`);
  if (!r2obj) return jsonError(404, 'doc_missing');
  const blob = await r2obj.json() as { v: 1; iv: string; ciphertext: string };

  return Response.json(
    { ...blob, revision: meta.revision, updatedAt: meta.updatedAt },
    { status: 200 },
  );
}

async function deleteDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;

  await env.INKMIRROR_SYNC_R2.delete(`${syncId}/${docId}`);
  await env.INKMIRROR_SYNC_KV.delete(`meta:${syncId}:${docId}`);
  return new Response(null, { status: 204 });
}

async function getList(request: Request, env: Env, syncId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;

  const prefix = `meta:${syncId}:`;
  const items: Array<{ docId: string; revision: number; updatedAt: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.INKMIRROR_SYNC_KV.list({ prefix, cursor });
    for (const k of page.keys) {
      const docId = k.name.slice(prefix.length);
      const rawMeta = await env.INKMIRROR_SYNC_KV.get(k.name);
      if (!rawMeta) continue;
      const meta = JSON.parse(rawMeta) as { revision: number; updatedAt: string };
      items.push({ docId, revision: meta.revision, updatedAt: meta.updatedAt });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return Response.json(items, { status: 200 });
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
