/**
 * Tiny semver-ish comparison used by minVersion / maxVersion gating.
 * Not a full semver implementation — we only need numeric major.minor.patch
 * ordering, with extra components ignored. Pre-release tags (e.g. "1.2.0-beta")
 * are treated as equal to their stripped form for ordering.
 */

function parseParts(v: string): number[] {
  const stripped = v.split(/[-+]/, 1)[0] ?? v;
  return stripped.split('.').map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const ap = parseParts(a);
  const bp = parseParts(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const x = ap[i] ?? 0;
    const y = bp[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function meetsVersionGate(
  running: string,
  min: string | undefined,
  max: string | undefined,
): boolean {
  if (min && compareVersions(running, min) < 0) return false;
  if (max && compareVersions(running, max) > 0) return false;
  return true;
}
