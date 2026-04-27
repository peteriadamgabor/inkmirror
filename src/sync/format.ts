//
// Plaintext bundle that gets encrypted into the sync blob.
// Same shape as the existing backup format, minus block_revisions.
//
// Why a separate module: future evolution (per-block sync, path C) will
// add fields here without touching the backup-to-disk format.

export interface SyncBundle {
  payloadVersion: 1;
  document: {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  };
  chapters: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  sentiments: Array<Record<string, unknown>>;
}

const SUPPORTED_VERSIONS: ReadonlySet<number> = new Set([1]);

export function serializeForSync(bundle: SyncBundle): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(bundle));
}

export function parseFromSync(bytes: Uint8Array): SyncBundle {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as SyncBundle;
  if (!SUPPORTED_VERSIONS.has(parsed.payloadVersion)) {
    throw new Error(`unsupported payloadVersion ${parsed.payloadVersion}`);
  }
  return parsed;
}
