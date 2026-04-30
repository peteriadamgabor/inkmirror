// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { deriveKeys, encryptBundle, decryptBundle, generatePaircode, constantTimeEqualBytes, importEncKey } from './crypto';

// Argon2id MODERATE is ~1 s; each test with two calls ≈ 2 s + headroom
const TIMEOUT = 20_000;

describe('crypto.deriveKeys', () => {
  // a fixed 16-byte salt for reproducibility (base64url, no padding)
  const SALT = new Uint8Array([
    0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
    0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,0x10,
  ]);
  const PASSPHRASE = 'river-canyon-violet-anchor';

  it('returns 32-byte K_enc and K_auth and 32-byte auth_proof', async () => {
    const out = await deriveKeys(PASSPHRASE, SALT);
    expect(out.K_enc).toBeInstanceOf(Uint8Array);
    expect(out.K_enc.length).toBe(32);
    expect(out.K_auth).toBeInstanceOf(Uint8Array);
    expect(out.K_auth.length).toBe(32);
    expect(out.auth_proof).toBeInstanceOf(Uint8Array);
    expect(out.auth_proof.length).toBe(32);
  }, TIMEOUT);

  it('is deterministic for the same passphrase + salt', async () => {
    const a = await deriveKeys(PASSPHRASE, SALT);
    const b = await deriveKeys(PASSPHRASE, SALT);
    expect(a.K_enc).toEqual(b.K_enc);
    expect(a.K_auth).toEqual(b.K_auth);
  }, TIMEOUT);

  it('K_enc and K_auth are domain-separated (different keys)', async () => {
    const out = await deriveKeys(PASSPHRASE, SALT);
    expect(out.K_enc).not.toEqual(out.K_auth);
  }, TIMEOUT);

  it('different passphrases produce different keys', async () => {
    const a = await deriveKeys(PASSPHRASE, SALT);
    const b = await deriveKeys('different-passphrase-here-now', SALT);
    expect(a.K_enc).not.toEqual(b.K_enc);
  }, TIMEOUT);

  it('rejects a salt of the wrong length', async () => {
    await expect(deriveKeys(PASSPHRASE, new Uint8Array(8))).rejects.toThrow(/16 bytes/);
  });

  it('different salts produce different keys', async () => {
    const otherSalt = new Uint8Array(SALT);
    otherSalt[0] ^= 0xff;
    const a = await deriveKeys(PASSPHRASE, SALT);
    const b = await deriveKeys(PASSPHRASE, otherSalt);
    expect(a.K_enc).not.toEqual(b.K_enc);
  }, TIMEOUT);

  it('auth_proof equals SHA-256(K_auth)', async () => {
    const out = await deriveKeys(PASSPHRASE, SALT);
    // Slice into a plain ArrayBuffer-backed Uint8Array so crypto.subtle.digest
    // accepts it under TS 5.9's stricter Uint8Array<ArrayBuffer> overloads.
    const K_auth_buf = new Uint8Array(out.K_auth.buffer.slice(out.K_auth.byteOffset, out.K_auth.byteOffset + out.K_auth.byteLength) as ArrayBuffer);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', K_auth_buf));
    expect(out.auth_proof).toEqual(expected);
  }, TIMEOUT);
});

describe('crypto.encryptBundle / decryptBundle', () => {
  let K_enc: CryptoKey;

  beforeAll(async () => {
    K_enc = await importEncKey(crypto.getRandomValues(new Uint8Array(32)));
  });

  const PLAINTEXT = new TextEncoder().encode(JSON.stringify({ payloadVersion: 1, blocks: [] }));

  it('round-trips a plaintext bundle with matching AAD', async () => {
    const blob = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    expect(blob.v).toBe(1);
    expect(blob.iv).toMatch(/^[A-Za-z0-9_-]+$/);            // base64url
    expect(blob.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    const decrypted = await decryptBundle(K_enc, blob, 'sync-id-A', 'doc-id-X');
    expect(decrypted).toEqual(PLAINTEXT);
  });

  it('produces a fresh IV every call (no reuse)', async () => {
    const a = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    const b = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('rejects decryption when AAD syncId differs (anti-blob-swap)', async () => {
    const blob = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    await expect(decryptBundle(K_enc, blob, 'sync-id-B', 'doc-id-X')).rejects.toThrow();
  });

  it('rejects decryption when AAD docId differs', async () => {
    const blob = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    await expect(decryptBundle(K_enc, blob, 'sync-id-A', 'doc-id-Y')).rejects.toThrow();
  });

  it('rejects decryption with the wrong key', async () => {
    const blob = await encryptBundle(K_enc, PLAINTEXT, 'sync-id-A', 'doc-id-X');
    const wrongKey = await importEncKey(crypto.getRandomValues(new Uint8Array(32)));
    await expect(decryptBundle(wrongKey, blob, 'sync-id-A', 'doc-id-X')).rejects.toThrow();
  });

  it('imported encryption key is non-extractable (the whole point of I1)', async () => {
    // The CryptoKey API exposes `extractable` as a public property.
    // If anything regresses and turns it back on, this asserts loudly.
    expect(K_enc.extractable).toBe(false);
    expect(K_enc.type).toBe('secret');
    // exportKey on a non-extractable key must reject.
    await expect(crypto.subtle.exportKey('raw', K_enc)).rejects.toThrow();
  });
});

describe('crypto.generatePaircode', () => {
  it('produces a 6-character code excluding 0/O/1/I/L', () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePaircode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    }
  });
  it('produces a different code on each call (probabilistic)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generatePaircode());
    expect(seen.size).toBeGreaterThan(95);
  });
});

describe('crypto.constantTimeEqualBytes', () => {
  it('returns true for identical buffers', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqualBytes(a, b)).toBe(true);
  });
  it('returns false for differing buffers (same length)', () => {
    expect(constantTimeEqualBytes(new Uint8Array([1, 2, 3, 4]), new Uint8Array([1, 2, 3, 5]))).toBe(false);
  });
  it('returns false for different-length buffers', () => {
    expect(constantTimeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3, 0]))).toBe(false);
  });
});
