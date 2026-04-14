import { setSentiment } from '@/store/document';
import type { UUID } from '@/types';
import { getAiClient } from './index';
import { logAiError } from './errors';

function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

// Serialize analysis per block id — if a block is edited again while its
// previous analysis is in-flight, we queue a re-run and drop intermediate
// dupes. The in-flight promise + the latest pending text are kept per block.
interface AnalysisState {
  inflight: Promise<void> | null;
  pendingText: string | null;
}

const state = new Map<UUID, AnalysisState>();

export function scheduleSentiment(blockId: UUID, text: string): void {
  let entry = state.get(blockId);
  if (!entry) {
    entry = { inflight: null, pendingText: null };
    state.set(blockId, entry);
  }
  if (entry.inflight) {
    entry.pendingText = text;
    return;
  }
  entry.inflight = runAnalysis(blockId, text).finally(() => {
    const e = state.get(blockId);
    if (!e) return;
    e.inflight = null;
    if (e.pendingText !== null) {
      const next = e.pendingText;
      e.pendingText = null;
      scheduleSentiment(blockId, next);
    }
  });
}

async function runAnalysis(blockId: UUID, text: string): Promise<void> {
  try {
    const client = getAiClient();
    if (!client.isReady()) {
      // Model still loading; kick preload and bail — the next commit will retry.
      client.preload().catch(() => undefined);
      return;
    }
    const result = await client.detectSentiment(text);
    const top = result[0];
    if (!top) return;
    setSentiment(blockId, {
      label: top.label,
      score: top.score,
      contentHash: contentHash(text),
      analyzedAt: new Date().toISOString(),
    });
  } catch (err) {
    logAiError('analyze.runAnalysis', err);
  }
}
