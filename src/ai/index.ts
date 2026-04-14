import { createAiClient, type AiClientHandle } from './client';
import { setSentimentHook, store } from '@/store/document';
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
    client
      .preload()
      .then(() => backfillSentiments())
      .catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 2000 });
  } else {
    setTimeout(kick, 500);
  }
}

function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

/**
 * After the model is ready, walk every block in the current store and
 * analyze any that are missing a sentiment row OR whose content hash
 * no longer matches the stored one. Runs once per boot.
 */
function backfillSentiments(): void {
  const order = store.blockOrder;
  for (const id of order) {
    const block = store.blocks[id];
    if (!block || block.deleted_at) continue;
    const text = block.content.trim();
    if (!text) continue;
    const existing = store.sentiments[id];
    if (existing && existing.contentHash === contentHash(block.content)) continue;
    scheduleSentiment(id, block.content);
  }
}

export type { LanguageResult, SentimentResult, AiClientHandle } from './client';
