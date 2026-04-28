/**
 * Live, dev-mode override for the inconsistency contradiction
 * threshold.
 *
 * The default threshold (`DEFAULT_THRESHOLD = 0.75`) lives in this
 * module so production code reaches for `getContradictionThreshold()`
 * instead of an inline constant — a single read of localStorage on
 * scan start is negligible, and it lets the dev menu retune live
 * without a redeploy.
 *
 * Range is clamped to [0.30, 0.95]: below 0.30 the NLI noise floor
 * makes everything a "contradiction," above 0.95 nothing fires.
 * Out-of-range writes are clamped silently; non-numeric / missing
 * reads fall through to the default.
 */

import { createSignal, type Accessor } from 'solid-js';

const STORAGE_KEY = 'inkmirror.dev.threshold';
export const DEFAULT_THRESHOLD = 0.75;
export const MIN_THRESHOLD = 0.3;
export const MAX_THRESHOLD = 0.95;

function clamp(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return DEFAULT_THRESHOLD;
  if (n < MIN_THRESHOLD) return MIN_THRESHOLD;
  if (n > MAX_THRESHOLD) return MAX_THRESHOLD;
  return n;
}

function readStored(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    return clamp(parsed);
  } catch {
    return null;
  }
}

const [overrideValue, setOverrideValue] = createSignal<number | null>(readStored());

/**
 * Reads the current effective threshold — the override if set,
 * otherwise the default.
 */
export function getContradictionThreshold(): number {
  return overrideValue() ?? DEFAULT_THRESHOLD;
}

/** Solid signal — `true` while a localStorage override is active. */
export const isThresholdOverridden: Accessor<boolean> = () =>
  overrideValue() !== null;

/**
 * Persists a new threshold (clamped to the valid range) and updates
 * the signal so subscribers re-render. NaN / non-finite values are
 * coerced to the default rather than rejected outright — keeps the
 * slider write path simple.
 */
export function setContradictionThreshold(n: number): void {
  const next = clamp(n);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next.toString());
  } catch {
    // Ignore — best-effort.
  }
  setOverrideValue(next);
}

/** Drops the override; threshold returns to default and badge hides. */
export function resetContradictionThreshold(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — best-effort.
  }
  setOverrideValue(null);
}

/** Test-only: re-read the storage value to refresh the signal. */
export function _refreshThreshold(): void {
  setOverrideValue(readStored());
}
