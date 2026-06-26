interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  DISCORD_WEBHOOK?: string;
  /** Shared secret injected on GlitchTip ingest to pass the NetBird auth proxy. */
  GLITCHTIP_PROXY_AUTH_VALUE?: string;
  /** Header name for the NetBird secret; defaults to `X-NetBird-Auth`. */
  GLITCHTIP_PROXY_AUTH_HEADER?: string;
  INKMIRROR_SYNC_KV: KVNamespace;
  INKMIRROR_SYNC_R2: R2Bucket;
  RL_SYNC_WRITE: RateLimit;
  RL_SYNC_READ:  RateLimit;
  RL_SYNC_PAIR:  RateLimit;
}
