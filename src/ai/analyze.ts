import { setSentiment } from '@/store/document';
import { MOODS, type UUID } from '@/types';
import { contentHash } from '@/utils/hash';
import { getAiClient } from './index';
import { getStoredProfile } from './profile';
import { logAiError } from './errors';

// Serialize analysis per block id — if a block is edited again while its
// previous analysis is in-flight, we queue a re-run and drop intermediate
// dupes. The in-flight promise + the latest pending text are kept per block.
interface AnalysisState {
  inflight: Promise<void> | null;
  pendingText: string | null;
}

const state = new Map<UUID, AnalysisState>();

/**
 * Drop all per-block analysis state. Call when switching documents so
 * stale block ids don't accumulate and so that an `import 'replace'`
 * that reuses ids cannot inherit a still-pending in-flight from the
 * prior document.
 */
export function resetAnalyzer(): void {
  state.clear();
}

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
    const profile = getStoredProfile();
    let label: string;
    let score: number;
    if (profile === 'deep') {
      const result = await client.classifyMood(text, MOODS);
      const top = result[0];
      if (!top) return;
      label = top.label;
      score = top.score;
    } else {
      const result = await client.detectSentiment(text);
      const top = result[0];
      if (!top) return;
      label = top.label;
      score = top.score;
    }
    setSentiment(blockId, {
      label,
      score,
      contentHash: contentHash(text),
      analyzedAt: new Date().toISOString(),
      source: profile === 'deep' ? 'deep' : 'light',
    });
  } catch (err) {
    logAiError('analyze.runAnalysis', err);
  }
}
