import { describe, it, expect } from 'vitest';
import { deriveKeys } from './crypto';

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
});
