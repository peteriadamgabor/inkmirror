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
