/**
 * Inconsistency-detection orchestrator for the Near tier.
 *
 * Pure v1: runs a full-manuscript scan on demand ("Run now"). Pulls
 * character-mentioning sentences from the store, prunes pairs by shared
 * character + shared trigger category, then calls NLI on the surviving
 * pairs. Flags pairs where the max contradiction score (across both
 * NLI directions) crosses the threshold.
 *
 * Idle-driven background scheduling is deferred to a follow-up. The
 * manual path validates the whole pipeline end-to-end with minimal
 * infrastructure.
 */

import {
  store,
  setInconsistencyFlag,
  replaceInconsistencyFlags,
  setConsistencyScanProgress,
} from '@/store/document';
import { lang as currentLang } from '@/i18n';
import { extractSentences, candidatePairs } from '@/engine/claim-extraction';
import { makeFlagId, type InconsistencyFlag } from '@/types';
import { contentHash } from '@/utils/hash';
import { getAiClient } from './index';
import { getStoredProfile } from './profile';
import { logAiError } from './errors';

const CONTRADICTION_THRESHOLD = 0.75;

export interface ScanOptions {
  /**
   * Called with each completed pair — lets tests assert without waiting.
   * Production code ignores this and watches `store.consistencyScan`.
   */
  onPairComplete?: (pair: number, total: number) => void;
  /** Abort signal — cancels mid-scan when flipped. */
  signal?: AbortSignal;
}

let scanInFlight: Promise<void> | null = null;

export function isScanRunning(): boolean {
  return scanInFlight !== null;
}

/**
 * Run a full consistency scan over the active document. No-ops if a
 * scan is already in flight or the profile is lightweight.
 */
export async function runConsistencyScan(
  opts: ScanOptions = {},
): Promise<void> {
  if (scanInFlight) return scanInFlight;
  const doc = store.document;
  if (!doc) return;
  if (getStoredProfile() !== 'deep') return;

  scanInFlight = doScan(doc.id, opts).finally(() => {
    scanInFlight = null;
  });
  return scanInFlight;
}

async function doScan(documentId: string, opts: ScanOptions): Promise<void> {
  const client = getAiClient();
  if (!client.isReady()) {
    // If the model isn't loaded, there's nothing useful we can do —
    // the caller (Settings preload, or user toggling deep) will kick
    // preload separately. Bail silently.
    return;
  }

  // Snapshot the blocks and mentions we'll scan. Working on a snapshot
  // avoids racing with user edits mid-scan.
  const blocks = store.blockOrder
    .map((id) => store.blocks[id])
    .filter((b) => b && !b.deleted_at);
  const mentions: Record<string, string[]> = {};
  for (const [blockId, ids] of Object.entries(store.characterMentions)) {
    mentions[blockId] = [...ids];
  }
  const existingDismissals = new Map<string, InconsistencyFlag>();
  for (const f of Object.values(store.inconsistencyFlags)) {
    if (f.status === 'dismissed') existingDismissals.set(f.id, f);
  }

  const lang = resolveLang();
  const sentences = extractSentences(blocks, mentions, lang);
  const pairs = candidatePairs(sentences);

  setConsistencyScanProgress({ processed: 0, total: pairs.length, running: true });

  const emitted: InconsistencyFlag[] = [];
  let processed = 0;

  try {
    for (const pair of pairs) {
      if (opts.signal?.aborted) break;
      const score = await scorePair(pair.a.text, pair.b.text);
      if (score >= CONTRADICTION_THRESHOLD) {
        const flag = buildFlag(documentId, pair, score);
        // Respect prior dismissal for the exact same block-hash combo.
        const prior = existingDismissals.get(flag.id);
        if (
          prior &&
          prior.block_a_hash === flag.block_a_hash &&
          prior.block_b_hash === flag.block_b_hash
        ) {
          emitted.push(prior);
        } else {
          emitted.push(flag);
        }
      }
      processed++;
      setConsistencyScanProgress({
        processed,
        total: pairs.length,
        running: true,
      });
      opts.onPairComplete?.(processed, pairs.length);
    }

    // Atomic replace of the flags for this document, then persist each.
    replaceInconsistencyFlags(emitted);
    for (const flag of emitted) setInconsistencyFlag(flag);
  } catch (err) {
    logAiError('inconsistency.doScan', err);
  } finally {
    setConsistencyScanProgress(null);
  }
}

async function scorePair(a: string, b: string): Promise<number> {
  const client = getAiClient();
  const [one, two] = await Promise.all([
    client.nliPair(a, b).catch(() => null),
    client.nliPair(b, a).catch(() => null),
  ]);
  let best = 0;
  if (one) best = Math.max(best, one.contradiction);
  if (two) best = Math.max(best, two.contradiction);
  return best;
}

function buildFlag(
  documentId: string,
  pair: { characterId: string; a: { blockId: string; sentenceIdx: number; text: string; categories: Set<string> }; b: { blockId: string; sentenceIdx: number; text: string; categories: Set<string> } },
  score: number,
): InconsistencyFlag {
  const blockA = store.blocks[pair.a.blockId];
  const blockB = store.blocks[pair.b.blockId];
  const sharedCats = Array.from(pair.a.categories).filter((c) =>
    pair.b.categories.has(c),
  ) as InconsistencyFlag['trigger_categories'];
  const id = makeFlagId(
    documentId,
    pair.a.blockId,
    pair.a.sentenceIdx,
    pair.b.blockId,
    pair.b.sentenceIdx,
  );
  return {
    id,
    document_id: documentId,
    character_id: pair.characterId,
    block_a_id: pair.a.blockId,
    block_a_hash: contentHash(blockA?.content ?? ''),
    block_a_sentence_idx: pair.a.sentenceIdx,
    block_a_sentence: pair.a.text,
    block_b_id: pair.b.blockId,
    block_b_hash: contentHash(blockB?.content ?? ''),
    block_b_sentence_idx: pair.b.sentenceIdx,
    block_b_sentence: pair.b.text,
    trigger_categories: sharedCats,
    contradiction_score: score,
    status: 'active',
    created_at: Date.now(),
    dismissed_at: null,
  };
}

function resolveLang(): 'en' | 'hu' {
  const l = currentLang();
  return l === 'hu' ? 'hu' : 'en';
}
