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

  // Path-segment bounds: a real syncId is 22 chars (16 bytes base64url)
  // and a real docId is a 36-char UUID. The caps leave generous headroom
  // while keeping hostile multi-KB path segments from ever reaching the
  // KV/R2 key layer.

  // /sync/circles/:syncId/paircode
  const paircodeMatch = path.match(/^\/sync\/circles\/([A-Za-z0-9_-]{1,64})\/paircode$/);
  if (paircodeMatch && method === 'POST') {
    return await postIssuePaircode(request, env, paircodeMatch[1]);
  }

  // /sync/list/:syncId
  const listMatch = path.match(/^\/sync\/list\/([A-Za-z0-9_-]{1,64})$/);
  if (listMatch && method === 'GET') {
    return await getList(request, env, listMatch[1]);
  }

  // /sync/circles/:syncId  (strict end — no /paircode suffix)
  const circleDeleteMatch = path.match(/^\/sync\/circles\/([A-Za-z0-9_-]{1,64})$/);
  if (circleDeleteMatch && method === 'DELETE') {
    return await deleteCircle(request, env, circleDeleteMatch[1]);
  }

  // /sync/doc/:syncId/:docId
  const docMatch = path.match(/^\/sync\/doc\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,128})$/);
  if (docMatch) {
    const [, syncId, docId] = docMatch;
    if (method === 'PUT')    return await putDoc(request, env, syncId, docId);
    if (method === 'GET')    return await getDoc(request, env, syncId, docId);
    if (method === 'DELETE') return await deleteDoc(request, env, syncId, docId);
  }

  return new Response('Not Found', { status: 404 });
}

async function postCircle(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rl = await rateLimit(env.RL_SYNC_PAIR, ip);
  if (rl) return rl;

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
  // Per-IP rate-limit BEFORE any KV read so a spammer with arbitrary
  // bearer tokens can't amplify KV usage on guessed syncIds. This is
  // intentionally the same RL_SYNC_PAIR binding used for unauth pair
  // routes — both are unauth-from-the-attacker's-perspective until
  // proof verification succeeds.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipRl = await rateLimit(env.RL_SYNC_PAIR, ip);
  if (ipRl) return { ok: false, res: ipRl };

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
  // Unknown circle and wrong proof both return 401 with the same code so
  // an attacker can't use the response to enumerate which syncIds exist.
  if (!raw) return { ok: false, res: jsonError(401, 'auth_mismatch') };
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

// --- rate-limit helper ---

async function rateLimit(
  binding: { limit(opts: { key: string }): Promise<{ success: boolean }> },
  key: string,
): Promise<Response | null> {
  const result = await binding.limit({ key });
  return result.success ? null : jsonError(429, 'rate_limited');
}

// --- new handlers ---

async function postIssuePaircode(request: Request, env: Env, syncId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_WRITE, syncId);
  if (rl) return rl;

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
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rl = await rateLimit(env.RL_SYNC_PAIR, ip);
  if (rl) return rl;

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
const MAX_DOCS_PER_CIRCLE = 100;
const MAX_CIRCLE_BYTES = 200 * 1024 * 1024; // 200 MB

async function putDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_WRITE, syncId);
  if (rl) return rl;

  // Reject oversized payloads BEFORE buffering the body. Cloudflare
  // Workers will otherwise read up to ~100 MB. Headroom of 1 KB covers
  // JSON envelope around the ciphertext.
  const cl = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(cl) && cl > MAX_BLOB_BYTES + 1024) return jsonError(413, 'too_large');

  const text = await request.text();
  if (text.length > MAX_BLOB_BYTES + 1024) return jsonError(413, 'too_large');

  let body: { v?: number; iv?: string; ciphertext?: string; expectedRevision?: number };
  try { body = JSON.parse(text); } catch { return jsonError(400, 'invalid_body'); }

  if (body.v !== 1) return jsonError(400, 'unsupported_v');
  if (typeof body.iv !== 'string' || typeof body.ciphertext !== 'string') return jsonError(400, 'invalid_body');
  if (typeof body.expectedRevision !== 'number') return jsonError(400, 'invalid_body');
  if (body.ciphertext.length > MAX_BLOB_BYTES) return jsonError(413, 'too_large');

  const objKey = `${syncId}/${docId}`;
  const metaKey = `meta:${syncId}:${docId}`;

  // Revision authority lives in R2 object metadata (strongly consistent),
  // NOT in KV: KV is eventually consistent across edges, so two devices
  // hitting different locations could both pass a KV-based check and
  // silently overwrite each other. Legacy objects (uploaded before this
  // scheme) carry no revision metadata and fall back to the KV mirror
  // once — their next successful push migrates them.
  const head = await env.INKMIRROR_SYNC_R2.head(objKey);
  const currentRevision = await resolveRevision(env, head, metaKey);

  if (body.expectedRevision !== currentRevision) {
    return Response.json({ currentRevision }, { status: 409 });
  }

  const newRevision = currentRevision + 1;
  const updatedAt = new Date().toISOString();
  const blob = JSON.stringify({ v: body.v, iv: body.iv, ciphertext: body.ciphertext });

  // Per-circle quotas, enforced only when this PUT would create a NEW doc
  // (head === null): circle creation is unauthenticated, so without a cap
  // one circle could hoard unbounded distinct docIds of 10 MB each.
  // Overwrites skip the check — they can't grow the doc count and the
  // per-doc cap above already bounds their size — so the R2 prefix scan
  // (same cost as getList) stays off the steady-state push path.
  if (!head) {
    const quota = await checkCircleQuota(env, syncId, blob.length);
    if (quota) return quota;
  }

  // Atomic compare-and-swap: this put succeeds only if the object is
  // still exactly the version we just read (or still absent). A racing
  // writer makes it fail cleanly instead of clobbering.
  const written = await env.INKMIRROR_SYNC_R2.put(objKey, blob, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { revision: String(newRevision), updatedAt },
    onlyIf: head ? { etagMatches: head.etag } : { etagDoesNotMatch: '*' },
  });
  if (!written) {
    // Lost the race — report the revision the winner left behind.
    const freshHead = await env.INKMIRROR_SYNC_R2.head(objKey);
    const freshRevision = await resolveRevision(env, freshHead, metaKey);
    return Response.json({ currentRevision: freshRevision }, { status: 409 });
  }

  // KV stays as a NON-authoritative mirror: legacy list entries read it,
  // and rolling back to the previous Worker keeps revision continuity.
  // Correctness no longer depends on it.
  await env.INKMIRROR_SYNC_KV.put(metaKey, JSON.stringify({ revision: newRevision, updatedAt }));

  return Response.json({ revision: newRevision, updatedAt }, { status: 200 });
}

/**
 * Doc-count + total-bytes quota for one circle, derived from a single R2
 * prefix list. Returns a 413 response when adding `incomingBytes` as a new
 * doc would breach either cap, null when the write may proceed.
 */
async function checkCircleQuota(
  env: Env,
  syncId: string,
  incomingBytes: number,
): Promise<Response | null> {
  const prefix = `${syncId}/`;
  let docCount = 0;
  let totalBytes = 0;
  let cursor: string | undefined;
  do {
    const page = await env.INKMIRROR_SYNC_R2.list({ prefix, cursor });
    for (const obj of page.objects) {
      docCount++;
      totalBytes += obj.size;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (docCount >= MAX_DOCS_PER_CIRCLE) return jsonError(413, 'doc_limit');
  if (totalBytes + incomingBytes > MAX_CIRCLE_BYTES) return jsonError(413, 'storage_limit');
  return null;
}

/**
 * Current revision for a doc: R2 customMetadata when present (authoritative),
 * otherwise the KV mirror (legacy objects + orphaned-mirror edge), else 0.
 */
async function resolveRevision(
  env: Env,
  head: R2Object | null,
  metaKey: string,
): Promise<number> {
  const fromMeta = head?.customMetadata?.revision;
  if (fromMeta !== undefined) {
    const n = Number(fromMeta);
    if (Number.isFinite(n)) return n;
  }
  const rawMeta = await env.INKMIRROR_SYNC_KV.get(metaKey);
  return rawMeta ? (JSON.parse(rawMeta) as { revision: number }).revision : 0;
}

async function getDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_READ, syncId);
  if (rl) return rl;

  // The blob is authoritative; its metadata carries the revision. Reading
  // KV first (the old order) could pair stale metadata with a newer blob.
  const r2obj = await env.INKMIRROR_SYNC_R2.get(`${syncId}/${docId}`);
  if (!r2obj) return jsonError(404, 'doc_missing');
  const blob = await r2obj.json() as { v: 1; iv: string; ciphertext: string };

  let revision: number;
  let updatedAt: string;
  const fromMeta = r2obj.customMetadata?.revision;
  if (fromMeta !== undefined && Number.isFinite(Number(fromMeta))) {
    revision = Number(fromMeta);
    updatedAt = r2obj.customMetadata?.updatedAt ?? r2obj.uploaded.toISOString();
  } else {
    // Legacy blob — revision still lives only in the KV mirror. A missing
    // mirror degrades to revision 0 so the doc stays reachable and the
    // next push migrates it, instead of 404ing a blob that exists.
    const rawMeta = await env.INKMIRROR_SYNC_KV.get(`meta:${syncId}:${docId}`);
    if (rawMeta) {
      const meta = JSON.parse(rawMeta) as { revision: number; updatedAt: string };
      revision = meta.revision;
      updatedAt = meta.updatedAt;
    } else {
      revision = 0;
      updatedAt = r2obj.uploaded.toISOString();
    }
  }

  return Response.json({ ...blob, revision, updatedAt }, { status: 200 });
}

async function deleteDoc(request: Request, env: Env, syncId: string, docId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_WRITE, syncId);
  if (rl) return rl;

  await env.INKMIRROR_SYNC_R2.delete(`${syncId}/${docId}`);
  await env.INKMIRROR_SYNC_KV.delete(`meta:${syncId}:${docId}`);
  return new Response(null, { status: 204 });
}

async function deleteCircle(request: Request, env: Env, syncId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_WRITE, syncId);
  if (rl) return rl;

  // Walk R2 (the blobs themselves), not the KV mirror: a mirror write
  // that failed in the past must not leave an encrypted blob orphaned on
  // the server forever. Per-item try/catch so one failure doesn't strand
  // the rest; any failure returns 503 WITHOUT deleting the circle key, so
  // the client's pending-deletion retry loop can finish the job later.
  let failed = false;
  const blobPrefix = `${syncId}/`;
  let r2Cursor: string | undefined;
  do {
    const page = await env.INKMIRROR_SYNC_R2.list({ prefix: blobPrefix, cursor: r2Cursor });
    for (const obj of page.objects) {
      const docId = obj.key.slice(blobPrefix.length);
      try {
        await env.INKMIRROR_SYNC_R2.delete(obj.key);
        await env.INKMIRROR_SYNC_KV.delete(`meta:${syncId}:${docId}`);
      } catch {
        failed = true;
      }
    }
    r2Cursor = page.truncated ? page.cursor : undefined;
  } while (r2Cursor);

  // Sweep KV mirrors whose blob is already gone (orphaned metadata).
  const metaPrefix = `meta:${syncId}:`;
  let kvCursor: string | undefined;
  do {
    const page = await env.INKMIRROR_SYNC_KV.list({ prefix: metaPrefix, cursor: kvCursor });
    for (const k of page.keys) {
      try {
        await env.INKMIRROR_SYNC_KV.delete(k.name);
      } catch {
        failed = true;
      }
    }
    kvCursor = page.list_complete ? undefined : page.cursor;
  } while (kvCursor);

  if (failed) return jsonError(503, 'partial_delete');

  await env.INKMIRROR_SYNC_KV.delete(`circle:${syncId}`);
  return new Response(null, { status: 204 });
}

async function getList(request: Request, env: Env, syncId: string): Promise<Response> {
  const a = await authenticateCircle(request, env, syncId);
  if (!a.ok) return a.res;
  const rl = await rateLimit(env.RL_SYNC_READ, syncId);
  if (rl) return rl;

  // List from R2 with metadata included — one strongly-consistent pass
  // instead of the old KV list + per-key KV get (eventually consistent
  // AND a read per doc). Legacy objects without revision metadata fall
  // back to the KV mirror until their next push migrates them.
  const prefix = `${syncId}/`;
  const items: Array<{ docId: string; revision: number; updatedAt: string }> = [];
  let cursor: string | undefined;
  do {
    // Note: with our compatibility date, list() returns customMetadata on
    // every object by default (the legacy `include` option is gone).
    const page = await env.INKMIRROR_SYNC_R2.list({ prefix, cursor });
    for (const obj of page.objects) {
      const docId = obj.key.slice(prefix.length);
      const fromMeta = obj.customMetadata?.revision;
      if (fromMeta !== undefined && Number.isFinite(Number(fromMeta))) {
        items.push({
          docId,
          revision: Number(fromMeta),
          updatedAt: obj.customMetadata?.updatedAt ?? obj.uploaded.toISOString(),
        });
        continue;
      }
      const rawMeta = await env.INKMIRROR_SYNC_KV.get(`meta:${syncId}:${docId}`);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta) as { revision: number; updatedAt: string };
        items.push({ docId, revision: meta.revision, updatedAt: meta.updatedAt });
      } else {
        items.push({ docId, revision: 0, updatedAt: obj.uploaded.toISOString() });
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
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
