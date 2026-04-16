const RING_SIZE = 50;
const ring: Array<{ timestamp: number; scope: string; error: unknown }> = [];

export function logAiError(scope: string, error: unknown): void {
  const entry = { timestamp: Date.now(), scope, error };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  // eslint-disable-next-line no-console
  console.error(`[ai:${scope}]`, error);
}

export function getAiErrors(): ReadonlyArray<{ timestamp: number; scope: string; error: unknown }> {
  return ring.slice();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __inkmirror_ai_errors: typeof getAiErrors }).__inkmirror_ai_errors = getAiErrors;
}
