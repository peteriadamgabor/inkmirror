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
