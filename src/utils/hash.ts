/**
 * djb2-style 32-bit string hash. Not cryptographic — used for cheap
 * change detection (invalidating sentiment rows, inconsistency flags
 * when a block is edited).
 */
export function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

/**
 * Same djb2 hash over raw bytes. Used by the sync engine to skip
 * re-encrypting + re-uploading a bundle whose serialized plaintext is
 * byte-identical to the last push.
 */
export function bytesHash(bytes: Uint8Array): string {
  let h = 5381;
  for (let i = 0; i < bytes.length; i++) h = ((h << 5) + h + bytes[i]) | 0;
  return h.toString(36);
}
