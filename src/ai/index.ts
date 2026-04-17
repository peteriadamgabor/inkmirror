import { createAiClient, type AiClientHandle } from './client';
import { setSentimentHook, store } from '@/store/document';
import { detectBackend, getStoredProfile } from './profile';
import { scheduleSentiment } from './analyze';

let singleton: AiClientHandle | null = null;
let hookInstalled = false;

function createWorker(): Worker {
  return new Worker(new URL('../workers/ai-worker.ts', import.meta.url), {
    type: 'module',
    name: 'inkmirror-ai',
  });
}

export function getAiClient(): AiClientHandle {
  if (!singleton) {
    singleton = createAiClient({ createWorker });
  }
  return singleton;
}

/**
 * Reset the client singleton — used by profile switches, which spawn a
 * fresh worker rather than disposing in-place (transformers.js doesn't
 * guarantee clean pipeline disposal across versions).
 */
export function resetAiClient(): void {
  singleton = null;
}

/**
 * Schedule a model preload on main-thread idle and wire the store's
 * sentiment hook so every content commit triggers analysis. Reads the
 * persisted AI profile and probes the GPU backend before configuring
 * the worker — the worker's preload loads whichever model that combo
 * requires.
 */
export function scheduleAiPreload(): void {
  const client = getAiClient();
  if (!hookInstalled) {
    setSentimentHook(scheduleSentiment);
    hookInstalled = true;
  }
  const kick = async () => {
    try {
      const profile = getStoredProfile();
      const backend = await detectBackend();
      await client.configure(profile, backend, 'q4');
      await client.preload();
      backfillSentiments();
    } catch {
      // Errors already surface through client.loadError(); swallow here
      // so the boot path never crashes on AI failure.
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => void kick(), { timeout: 2000 });
  } else {
    setTimeout(() => void kick(), 500);
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
