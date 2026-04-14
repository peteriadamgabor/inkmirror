import { createAiClient, type AiClientHandle } from './client';

let singleton: AiClientHandle | null = null;

function createWorker(): Worker {
  return new Worker(new URL('../workers/ai-worker.ts', import.meta.url), {
    type: 'module',
    name: 'storyforge-ai',
  });
}

export function getAiClient(): AiClientHandle {
  if (!singleton) {
    singleton = createAiClient({ createWorker });
  }
  return singleton;
}

/**
 * Schedule a model preload on main-thread idle. Safe to call multiple times;
 * the underlying client memoizes the preload promise.
 */
export function scheduleAiPreload(): void {
  const client = getAiClient();
  const kick = () => {
    client.preload().catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 2000 });
  } else {
    setTimeout(kick, 500);
  }
}

export type { LanguageResult, AiClientHandle } from './client';
