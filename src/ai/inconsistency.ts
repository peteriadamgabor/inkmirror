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
import { allVisibleBlocks } from '@/store/selectors';
import { lang as currentLang } from '@/i18n';
import { extractSentences, candidatePairs } from '@/engine/claim-extraction';
import {
  makeFlagId,
  type InconsistencyFlag,
  type TriggerCategory,
} from '@/types';
import { contentHash } from '@/utils/hash';
import { getAiClient } from './index';
import { getStoredProfile } from './profile';
import { logAiError } from './errors';
import { getContradictionThreshold } from './dev-threshold';

/**
 * Per-pair telemetry captured by the dev-mode instrumented scan.
 *
 * `nliForward` / `nliReverse` carry the two-class softmax shape the
 * worker actually returns (`{ entailment, contradiction }` — the
 * neutral class is dropped at the worker boundary). The dev-menu
 * histogram + tables consume this directly; production code ignores
 * the callback entirely.
 */
export interface PairScoreData {
  characterId: string;
  blockA: { id: string; sentenceIdx: number; sentence: string };
  blockB: { id: string; sentenceIdx: number; sentence: string };
  sharedCategories: TriggerCategory[];
  nliForward: { entailment: number; contradiction: number } | null;
  nliReverse: { entailment: number; contradiction: number } | null;
  maxContradiction: number;
  scoreMs: number;
}

export interface ScanOptions {
  /**
   * Called with each completed pair — lets tests assert without waiting.
   * Production code ignores this and watches `store.consistencyScan`.
   */
  onPairComplete?: (pair: number, total: number) => void;
  /** Abort signal — cancels mid-scan when flipped. */
  signal?: AbortSignal;
  /**
   * Dev-mode hook — called with the full NLI breakdown for every
   * scored pair, regardless of whether the score crosses the
   * threshold. Production code never sets this; only the dev menu's
   * `runInstrumentedScan` does.
   */
  onPairScored?: (data: PairScoreData) => void;
  /**
   * Dev-mode escape hatch — when true, the scan completes its work
   * (and fires `onPairScored` for every pair) but skips the final
   * `replaceInconsistencyFlags` / `setInconsistencyFlag` writes.
   * Lets the dev menu run repeated scans for tuning without
   * polluting the user's flag list.
   */
  dryRun?: boolean;
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
    // Model still loading — kick preload and wait for it. Surfacing
    // failure here lets the caller (Settings, ConsistencyPanel) show
    // the existing load-error UI instead of silently no-op'ing.
    try {
      await client.preload();
    } catch (err) {
      logAiError('inconsistency.preload', err);
      return;
    }
    if (!client.isReady()) return;
  }

  // The user may switch documents mid-scan. We capture the doc id at
  // the start and bail at every awaitable step if the active document
  // no longer matches — otherwise the scan would emit flags scoped to
  // a closed document into the now-loaded one's store.
  const stillActive = () => store.document?.id === documentId;
  if (!stillActive()) return;

  // Snapshot the blocks and mentions we'll scan. Working on a snapshot
  // avoids racing with user edits mid-scan.
  const blocks = allVisibleBlocks();
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

  // Snapshot the threshold once at scan start so a slider change
  // during a running scan doesn't split results across two cuts.
  const threshold = getContradictionThreshold();

  setConsistencyScanProgress({ processed: 0, total: pairs.length, running: true });

  const emitted: InconsistencyFlag[] = [];
  let processed = 0;

  try {
    for (const pair of pairs) {
      if (opts.signal?.aborted) return;
      if (!stillActive()) return; // doc switched mid-scan

      // Two paths: production fast path returns the max alone;
      // instrumented runs need the full breakdown plus timing.
      let score: number;
      if (opts.onPairScored) {
        const t0 = performance.now();
        const detailed = await scorePairDetailed(pair.a.text, pair.b.text);
        const scoreMs = performance.now() - t0;
        score = detailed.maxContradiction;
        if (!stillActive()) return; // re-check after the await
        opts.onPairScored({
          characterId: pair.characterId,
          blockA: { id: pair.a.blockId, sentenceIdx: pair.a.sentenceIdx, sentence: pair.a.text },
          blockB: { id: pair.b.blockId, sentenceIdx: pair.b.sentenceIdx, sentence: pair.b.text },
          sharedCategories: Array.from(pair.a.categories).filter((c) =>
            pair.b.categories.has(c),
          ) as TriggerCategory[],
          nliForward: detailed.forward,
          nliReverse: detailed.reverse,
          maxContradiction: score,
          scoreMs,
        });
      } else {
        score = await scorePair(pair.a.text, pair.b.text);
        if (!stillActive()) return; // re-check after the await
      }

      if (score >= threshold) {
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

    // Final guard before any store mutation: only persist if the doc
    // we scanned is still the active one. Dry-run path skips writes
    // so dev tuning doesn't pollute the user's flag list.
    if (!stillActive()) return;
    if (!opts.dryRun) {
      replaceInconsistencyFlags(emitted);
      for (const flag of emitted) setInconsistencyFlag(flag);
    }
  } catch (err) {
    logAiError('inconsistency.doScan', err);
  } finally {
    // Only clear the progress indicator we set — if a different scan
    // started after a doc switch, leave its progress alone.
    if (stillActive()) setConsistencyScanProgress(null);
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

/**
 * Like `scorePair` but keeps both NLI directions intact. Used only
 * by the dev-mode instrumented scan — production prefers the
 * lighter `scorePair` since it does not allocate the breakdown.
 */
async function scorePairDetailed(
  a: string,
  b: string,
): Promise<{
  forward: { entailment: number; contradiction: number } | null;
  reverse: { entailment: number; contradiction: number } | null;
  maxContradiction: number;
}> {
  const client = getAiClient();
  const [forward, reverse] = await Promise.all([
    client.nliPair(a, b).catch(() => null),
    client.nliPair(b, a).catch(() => null),
  ]);
  let best = 0;
  if (forward) best = Math.max(best, forward.contradiction);
  if (reverse) best = Math.max(best, reverse.contradiction);
  return { forward, reverse, maxContradiction: best };
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
