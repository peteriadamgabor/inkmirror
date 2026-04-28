/**
 * Dev-mode instrumented scan — wraps `runConsistencyScan` with the
 * `dryRun` + `onPairScored` hooks and aggregates per-pair telemetry
 * into an `InstrumentedScanResult` for the dev menu to render.
 *
 * The result is captured once per scan. The dev menu's slider re-
 * partitions `pairs` into above-threshold / near-misses / below-floor
 * live (Solid memo), so changing the threshold updates the histogram
 * and tables without a re-scan. Re-run is only needed when the
 * underlying prose changes or the timing needs refreshing.
 */

import { runConsistencyScan, type PairScoreData } from './inconsistency';
import { getContradictionThreshold } from './dev-threshold';
import { lang as currentLang } from '@/i18n';

export interface InstrumentedScanResult {
  /** Raw per-pair telemetry. The dev UI partitions live by score. */
  pairs: PairScoreData[];
  /** Total candidate pairs after trigger-word pruning. */
  candidatePairCount: number;
  totalScanMs: number;
  averagePairMs: number;
  slowestPairMs: number;
  detectedLang: 'en' | 'hu';
  /** Threshold captured at scan start (informational; UI uses live). */
  threshold: number;
}

export interface InstrumentedScanOptions {
  signal?: AbortSignal;
}

export async function runInstrumentedScan(
  opts: InstrumentedScanOptions = {},
): Promise<InstrumentedScanResult> {
  const pairs: PairScoreData[] = [];
  const threshold = getContradictionThreshold();
  const t0 = performance.now();

  await runConsistencyScan({
    signal: opts.signal,
    dryRun: true,
    onPairScored: (data) => {
      pairs.push(data);
    },
  });

  const totalScanMs = performance.now() - t0;
  const slowestPairMs = pairs.reduce((m, p) => Math.max(m, p.scoreMs), 0);
  const averagePairMs =
    pairs.length === 0
      ? 0
      : pairs.reduce((sum, p) => sum + p.scoreMs, 0) / pairs.length;

  return {
    pairs,
    candidatePairCount: pairs.length,
    totalScanMs,
    averagePairMs,
    slowestPairMs,
    detectedLang: currentLang() === 'hu' ? 'hu' : 'en',
    threshold,
  };
}
