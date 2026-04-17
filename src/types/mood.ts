/**
 * Rich literary mood vocabulary for the Near tier.
 *
 * Used when the AI profile is 'deep' (mDeBERTa). The legacy 3-class
 * sentiment (positive/neutral/negative) persists alongside under the
 * 'light' profile — see classifyLabel() for routing.
 */

export type Mood =
  | 'tender'
  | 'tension'
  | 'dread'
  | 'longing'
  | 'grief'
  | 'hope'
  | 'joy'
  | 'wonder'
  | 'rage'
  | 'calm';

export const MOODS: readonly Mood[] = [
  'tender', 'tension', 'dread', 'longing', 'grief',
  'hope',   'joy',     'wonder', 'rage',   'calm',
] as const;

export type Valence = 'positive' | 'negative' | 'neutral';

/**
 * Projection of each mood to an EKG valence axis — drives the Story Pulse
 * ECG up/down direction. Hue is carried separately via MOOD_HUE.
 */
export const MOOD_VALENCE: Record<Mood, Valence> = {
  joy: 'positive',
  hope: 'positive',
  tender: 'positive',
  wonder: 'positive',
  calm: 'positive',
  dread: 'negative',
  grief: 'negative',
  rage: 'negative',
  tension: 'negative',
  longing: 'neutral',
};

/**
 * 10 hand-picked hex colors for the heatmap, ECG bar fills, and legend.
 * Tuned to read on the warm stone paper background in both light and
 * dark modes. May need a tuning pass during implementation.
 */
export const MOOD_HUE: Record<Mood, string> = {
  tender:  '#E8A5B8',  // soft pink
  joy:     '#F5C842',  // warm gold
  hope:    '#7FBF8F',  // sage
  wonder:  '#8EA7E9',  // periwinkle
  calm:    '#B8C9BF',  // pale sage-grey
  longing: '#B79BC9',  // muted violet
  tension: '#E69A56',  // amber
  dread:   '#6B5B7B',  // dusk purple
  grief:   '#5A7A8F',  // slate blue
  rage:    '#C85A5A',  // muted red
};

export function isMood(value: unknown): value is Mood {
  return typeof value === 'string' && (MOODS as readonly string[]).includes(value);
}

/**
 * Classify a raw label string from either model:
 * - Deep labels resolve to `{ source: 'deep', mood }`.
 * - Legacy light labels resolve to `{ source: 'light', valence }`.
 * - Anything else returns null (treat as un-analyzed).
 */
export type ClassifiedLabel =
  | { source: 'deep'; mood: Mood }
  | { source: 'light'; valence: Valence };

export function classifyLabel(label: string): ClassifiedLabel | null {
  if (isMood(label)) return { source: 'deep', mood: label };
  if (label === 'positive' || label === 'negative' || label === 'neutral') {
    return { source: 'light', valence: label };
  }
  return null;
}
