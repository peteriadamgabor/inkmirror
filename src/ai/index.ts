import { createAiClient, type AiClientHandle } from './client';
import { setSentimentHook } from '@/store/document';
import { scheduleSentiment } from './analyze';

let singleton: AiClientHandle | null = null;
let hookInstalled = false;

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
 * Schedule a model preload on main-thread idle and wire the store's
 * sentiment hook so every content commit triggers analysis.
 */
export function scheduleAiPreload(): void {
  const client = getAiClient();
  if (!hookInstalled) {
    setSentimentHook(scheduleSentiment);
    hookInstalled = true;
  }
  const kick = () => {
    client.preload().catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 2000 });
  } else {
    setTimeout(kick, 500);
  }
}

export type { LanguageResult, SentimentResult, AiClientHandle } from './client';
