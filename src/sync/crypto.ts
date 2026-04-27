let _sodiumModule: typeof import('libsodium-wrappers-sumo') | null = null;

async function loadSodium(): Promise<typeof import('libsodium-wrappers-sumo').default> {
  if (!_sodiumModule) {
    _sodiumModule = await import('libsodium-wrappers-sumo');
  }
  await _sodiumModule.default.ready;
  return _sodiumModule.default;
}

export interface DerivedKeys {
  K_enc: Uint8Array;       // 32 bytes — encryption key, never transmitted
  K_auth: Uint8Array;      // 32 bytes — bearer token sent on authenticated requests
  auth_proof: Uint8Array;  // 32 bytes — SHA-256(K_auth), stored on server
}

/**
 * Derive K_enc, K_auth, and auth_proof from a passphrase + salt.
 *
 * - One Argon2id pass at MODERATE cost (~1 s on a modern device, 256 MiB memory)
 *   produces K_master (32 bytes).
 * - HKDF-SHA256 splits K_master into K_enc and K_auth using domain-separated info
 *   strings — changing them invalidates v1 keys cleanly.
 * - auth_proof = SHA-256(K_auth) is what the server stores at circle creation.
 */
export async function deriveKeys(passphrase: string, salt: Uint8Array): Promise<DerivedKeys> {
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');
  const sodium = await loadSodium();

  const K_master = sodium.crypto_pwhash(
    32,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  const K_master_buf = new Uint8Array(K_master.buffer.slice(K_master.byteOffset, K_master.byteOffset + K_master.byteLength) as ArrayBuffer);
  const K_enc = await hkdfExpand(K_master_buf, 'inkmirror.sync.enc.v1');
  const K_auth = await hkdfExpand(K_master_buf, 'inkmirror.sync.auth.v1');

  const auth_proof = new Uint8Array(
    await crypto.subtle.digest('SHA-256', K_auth),
  );

  // Best-effort: zero K_master immediately. (Note: libsodium pulls into a TypedArray
  // we don't fully own, so this is hygiene, not a guarantee.)
  K_master.fill(0);
  K_master_buf.fill(0);

  return { K_enc, K_auth, auth_proof };
}

async function hkdfExpand(ikm: Uint8Array<ArrayBuffer>, info: string): Promise<Uint8Array<ArrayBuffer>> {
  // ikm is non-secret-purpose-bound (already 32 bytes of high entropy); we use
  // an empty salt and HKDF-Expand only.
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    key,
    32 * 8,
  );
  return new Uint8Array(bits.slice(0));
}

/**
 * Wire-level encrypted blob. `v` is the *encryption-layer* version
 * (cipher + KDF). It is independent of the inner plaintext bundle's own
 * version field. Bumping v is reserved for crypto changes only.
 */
export interface EncryptedBlob {
  v: 1;
  iv: string;          // base64url, 12 bytes
  ciphertext: string;  // base64url
}

const ENC_VERSION = 1 as const;

/**
 * Encrypt a plaintext bundle for storage. AAD is bound to (syncId, docId, v)
 * so an attacker with R2 write access cannot swap blob slots — decryption
 * fails the AES-GCM auth tag.
 */
export async function encryptBundle(
  K_enc: Uint8Array,
  plaintext: Uint8Array,
  syncId: string,
  docId: string,
): Promise<EncryptedBlob> {
  const iv = narrowBuffer(crypto.getRandomValues(new Uint8Array(12)));
  const aad = new TextEncoder().encode(`${syncId}|${docId}|v${ENC_VERSION}`);
  const key = await crypto.subtle.importKey('raw', narrowBuffer(K_enc), 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, narrowBuffer(plaintext)),
  );
  return {
    v: ENC_VERSION,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(cipher),
  };
}

export async function decryptBundle(
  K_enc: Uint8Array,
  blob: EncryptedBlob,
  syncId: string,
  docId: string,
): Promise<Uint8Array> {
  if (blob.v !== ENC_VERSION) {
    throw new Error(`unsupported blob version ${blob.v}`);
  }
  const iv = narrowBuffer(fromBase64Url(blob.iv));
  const cipher = narrowBuffer(fromBase64Url(blob.ciphertext));
  const aad = new TextEncoder().encode(`${syncId}|${docId}|v${blob.v}`);
  const key = await crypto.subtle.importKey('raw', narrowBuffer(K_enc), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, cipher),
  );
  return plain;
}

/**
 * Narrow a Uint8Array<ArrayBufferLike> to a fresh Uint8Array<ArrayBuffer> so it
 * passes Web Crypto's strict `BufferSource` overloads on TS 5.7+. ~32-byte alloc
 * per call — negligible.
 */
function narrowBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Uint8Array(buf);
}

// --- base64url helpers (RFC 4648 §5, no padding) ---

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function fromBase64Url(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- paircode + constant-time compare ---

const PAIRCODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // base32 minus 0/O/1/I/L
const PAIRCODE_LENGTH = 6;

/**
 * Generate a 6-character paircode using a confusable-free alphabet.
 * Entropy: log2(31) * 6 ≈ 29.7 bits — fine because paircodes have a
 * 2-min TTL and are single-use, and the server validates them before
 * an attacker could enumerate.
 *
 * Uses rejection sampling to avoid modulo bias: bytes ≥ floor(256/31)*31
 * (i.e. ≥ 248) would skew the first 8 alphabet positions. We redraw
 * those instead. Average ~1.03 bytes consumed per output character.
 */
export function generatePaircode(): string {
  const ALPHA = PAIRCODE_ALPHABET.length;          // 31
  const REJECT_AT = Math.floor(256 / ALPHA) * ALPHA; // 248
  let out = '';
  while (out.length < PAIRCODE_LENGTH) {
    const buf = crypto.getRandomValues(new Uint8Array(PAIRCODE_LENGTH));
    for (let i = 0; i < buf.length && out.length < PAIRCODE_LENGTH; i++) {
      if (buf[i] < REJECT_AT) out += PAIRCODE_ALPHABET[buf[i] % ALPHA];
    }
  }
  return out;
}

/** Constant-time byte-array equality. */
export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
