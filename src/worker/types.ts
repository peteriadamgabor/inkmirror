interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  DISCORD_WEBHOOK?: string;
  INKMIRROR_SYNC_KV: KVNamespace;
  INKMIRROR_SYNC_R2: R2Bucket;
  RL_SYNC_WRITE: RateLimit;
  RL_SYNC_READ:  RateLimit;
  RL_SYNC_PAIR:  RateLimit;
}
