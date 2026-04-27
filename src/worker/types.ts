export interface Env {
  ASSETS: Fetcher;
  DISCORD_WEBHOOK?: string;
  INKMIRROR_SYNC_KV: KVNamespace;
  INKMIRROR_SYNC_R2: R2Bucket;
}
