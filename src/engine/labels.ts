/**
 * Unified accessors for any sentiment/mood label coming out of either
 * profile's model. Bridges the legacy 3-class vocabulary and the new
 * 10-mood Near tier palette so call sites can stay label-type-agnostic.
 */

import { classifyLabel, MOOD_HUE, MOOD_VALENCE, type Valence } from '@/types';

/** Hex color per light-profile valence — matches the pre-Near-tier ECG colors. */
export const SENTIMENT_HEX: Record<Valence, string> = {
  positive: '#10b981', // emerald-500
  neutral: '#a8a29e', // stone-400
  negative: '#ef4444', // red-500
};

const UNKNOWN_HEX = '#57534e'; // stone-600

/**
 * Hex color for any label. Unknown or null labels get a muted stone
 * tone consistent with the existing "not analyzed" dot.
 */
export function labelHex(label: string | null | undefined): string {
  if (!label) return UNKNOWN_HEX;
  const c = classifyLabel(label);
  if (!c) return UNKNOWN_HEX;
  return c.source === 'light' ? SENTIMENT_HEX[c.valence] : MOOD_HUE[c.mood];
}

/**
 * Valence of any label — used to project moods to the ECG's up/down axis.
 * Unknown labels fall back to neutral (flat pulse).
 */
export function labelValence(label: string | null | undefined): Valence {
  if (!label) return 'neutral';
  const c = classifyLabel(label);
  if (!c) return 'neutral';
  return c.source === 'light' ? c.valence : MOOD_VALENCE[c.mood];
}

/**
 * Signed polarity in [-1, 1]. Positive labels return +score, negative
 * labels return -score, neutral/unknown return 0. Used for plotting
 * character arcs where direction and magnitude both matter.
 */
export function labelPolarity(label: string | null | undefined, score: number): number {
  const valence = labelValence(label);
  if (valence === 'positive') return score;
  if (valence === 'negative') return -score;
  return 0;
}

/**
 * i18n key for the label. Falls back to `mood.unanalyzed` for unknown
 * labels so the UI never shows a raw model output.
 */
export function labelI18nKey(label: string): string {
  const c = classifyLabel(label);
  if (!c) return 'mood.unanalyzed';
  return c.source === 'light' ? `mood.${c.valence}` : `mood.${c.mood}`;
}
