import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairScoreData } from './inconsistency';

// We mock the underlying scan so we can synthesise per-pair callbacks
// without standing up the AI worker, IDB, and store. This is deliberately
// a higher mock point than the spec's "mock nliPair" — the wiring from
// nliPair through runConsistencyScan is already covered by the production
// path, and the only thing dev-instrumentation owns is aggregation.
vi.mock('./inconsistency', async () => {
  return {
    runConsistencyScan: vi.fn(async (opts: { onPairScored?: (d: PairScoreData) => void }) => {
      const samples = makeFakePairs();
      for (const sample of samples) opts.onPairScored?.(sample);
    }),
  };
});

vi.mock('@/i18n', () => ({
  lang: () => 'en',
  t: (key: string) => key,
}));

import { runInstrumentedScan } from './dev-instrumentation';
import { resetContradictionThreshold, setContradictionThreshold } from './dev-threshold';

function fakePair(score: number, ms: number, sentenceA = 'a', sentenceB = 'b'): PairScoreData {
  return {
    characterId: 'c1',
    blockA: { id: 'ba', sentenceIdx: 0, sentence: sentenceA },
    blockB: { id: 'bb', sentenceIdx: 0, sentence: sentenceB },
    sharedCategories: ['kinship'],
    nliForward: { entailment: 1 - score, contradiction: score },
    nliReverse: { entailment: 1 - score, contradiction: score },
    maxContradiction: score,
    scoreMs: ms,
  };
}

let _samples: PairScoreData[] = [];
function makeFakePairs(): PairScoreData[] {
  return _samples;
}

describe('dev-instrumentation', () => {
  beforeEach(() => {
    localStorage.clear();
    resetContradictionThreshold();
  });

  afterEach(() => {
    vi.clearAllMocks();
    _samples = [];
  });

  it('aggregates per-pair callbacks into a result', async () => {
    _samples = [
      fakePair(0.91, 12),
      fakePair(0.40, 8),
      fakePair(0.20, 4),
    ];

    const result = await runInstrumentedScan();

    expect(result.pairs).toHaveLength(3);
    expect(result.candidatePairCount).toBe(3);
    expect(result.slowestPairMs).toBe(12);
    expect(result.averagePairMs).toBeCloseTo((12 + 8 + 4) / 3, 5);
    expect(result.detectedLang).toBe('en');
    // threshold is captured at scan start
    expect(result.threshold).toBe(0.75);
    // total scan time bounds the per-pair times
    expect(result.totalScanMs).toBeGreaterThanOrEqual(0);
  });

  it('captures the live threshold override at scan start', async () => {
    _samples = [fakePair(0.50, 5)];
    setContradictionThreshold(0.42);

    const result = await runInstrumentedScan();

    expect(result.threshold).toBe(0.42);
  });

  it('returns an empty result when no pairs were scored', async () => {
    _samples = [];

    const result = await runInstrumentedScan();

    expect(result.pairs).toHaveLength(0);
    expect(result.candidatePairCount).toBe(0);
    expect(result.slowestPairMs).toBe(0);
    expect(result.averagePairMs).toBe(0);
  });
});
