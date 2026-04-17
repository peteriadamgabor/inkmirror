/**
 * Types for the Near tier's inconsistency-detection feature.
 *
 * Flags are character-attribute-centric: a pair of sentences (each tied to
 * one block) that NLI scored as contradictory, filtered through a
 * trigger-word category (kinship / body / profession).
 */

import type { UUID } from './ids';

export const TRIGGER_CATEGORIES = ['kinship', 'body', 'profession'] as const;
export type TriggerCategory = (typeof TRIGGER_CATEGORIES)[number];

export function isTriggerCategory(value: unknown): value is TriggerCategory {
  return typeof value === 'string' && (TRIGGER_CATEGORIES as readonly string[]).includes(value);
}

export type InconsistencyStatus = 'active' | 'dismissed';

export interface InconsistencyFlag {
  id: string;
  document_id: UUID;
  character_id: UUID;
  block_a_id: UUID;
  block_a_hash: string;
  block_a_sentence_idx: number;
  block_a_sentence: string;
  block_b_id: UUID;
  block_b_hash: string;
  block_b_sentence_idx: number;
  block_b_sentence: string;
  trigger_categories: TriggerCategory[];
  contradiction_score: number;
  status: InconsistencyStatus;
  created_at: number;
  dismissed_at: number | null;
}

/**
 * Stable, symmetric flag id. Sorting the two (blockId, sentenceIdx) tuples
 * guarantees makeFlagId('doc', A, 0, B, 1) === makeFlagId('doc', B, 1, A, 0),
 * which prevents duplicate flags for the same sentence pair.
 */
export function makeFlagId(
  documentId: UUID,
  blockAId: UUID,
  sentenceAIdx: number,
  blockBId: UUID,
  sentenceBIdx: number,
): string {
  const a = `${blockAId}#${sentenceAIdx}`;
  const b = `${blockBId}#${sentenceBIdx}`;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${documentId}:${lo}:${hi}`;
}
