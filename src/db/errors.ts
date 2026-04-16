const RING_SIZE = 100;
const ring: Array<{ timestamp: number; scope: string; error: unknown }> = [];

export function logDbError(scope: string, error: unknown): void {
  const entry = { timestamp: Date.now(), scope, error };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  // eslint-disable-next-line no-console
  console.error(`[db:${scope}]`, error);
}

export function getDbErrors(): ReadonlyArray<{ timestamp: number; scope: string; error: unknown }> {
  return ring.slice();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __inkmirror_errors: typeof getDbErrors }).__inkmirror_errors = getDbErrors;
}
