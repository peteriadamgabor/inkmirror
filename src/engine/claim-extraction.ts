/**
 * Pure sentence extraction + pair pruning for inconsistency detection.
 *
 * Two stages, each individually testable:
 *   1. extractSentences — walks a document's (non-deleted) blocks,
 *      splits each into sentences, keeps only those that mention a
 *      tracked character AND contain a trigger word from at least one
 *      category. Each surviving sentence carries enough metadata for
 *      the downstream NLI scan to build a stable flag id.
 *   2. candidatePairs — given the surviving sentences, emits the list
 *      of sentence-pair work-items that still deserve an NLI call.
 *      Prunes aggressively: only pairs that share ≥1 character AND
 *      ≥1 trigger category make it through.
 */

import type { Block, TriggerCategory, UUID } from '@/types';
import { splitSentences } from './sentence-split';
import { triggerCategories } from './trigger-words';

export interface ExtractedSentence {
  blockId: UUID;
  sentenceIdx: number;
  text: string;
  characterIds: UUID[];
  categories: Set<TriggerCategory>;
}

export interface CandidatePair {
  characterId: UUID;
  a: ExtractedSentence;
  b: ExtractedSentence;
}

type TriggerLang = 'en' | 'hu';

export function extractSentences(
  blocks: Block[],
  mentionsByBlock: Record<UUID, UUID[]>,
  lang: TriggerLang,
): ExtractedSentence[] {
  const out: ExtractedSentence[] = [];
  for (const block of blocks) {
    if (block.deleted_at) continue;
    const characterIds = mentionsByBlock[block.id];
    if (!characterIds || characterIds.length === 0) continue;
    const sentences = splitSentences(block.content);
    sentences.forEach((text, sentenceIdx) => {
      const categories = triggerCategories(text, lang);
      if (categories.size === 0) return;
      // Restrict the character list to those actually mentioned in THIS
      // sentence. We don't have per-sentence mention data from the
      // character matcher, so approximate: a character is "mentioned in
      // this sentence" if their name appears. Pass through for now —
      // character-matcher.ts runs per-block, and the block-level list
      // is the best signal we have without a deeper integration.
      out.push({
        blockId: block.id,
        sentenceIdx,
        text,
        characterIds,
        categories,
      });
    });
  }
  return out;
}

export function candidatePairs(sentences: ExtractedSentence[]): CandidatePair[] {
  const out: CandidatePair[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];
    for (let j = i + 1; j < sentences.length; j++) {
      const b = sentences[j];
      const sharedChar = firstShared(a.characterIds, b.characterIds);
      if (!sharedChar) continue;
      if (!shareAnyCategory(a.categories, b.categories)) continue;
      out.push({ characterId: sharedChar, a, b });
    }
  }
  return out;
}

function firstShared(a: UUID[], b: UUID[]): UUID | null {
  const setB = new Set(b);
  for (const id of a) if (setB.has(id)) return id;
  return null;
}

function shareAnyCategory(
  a: Set<TriggerCategory>,
  b: Set<TriggerCategory>,
): boolean {
  for (const c of a) if (b.has(c)) return true;
  return false;
}
