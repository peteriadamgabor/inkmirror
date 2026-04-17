/**
 * Derived store selectors.
 *
 * The app's "what's the dominant mood of this chapter?" / "give me the
 * blocks a character spoke" / "tally sentiment labels" queries used to
 * be duplicated across RightPanel, MoodHeatmap, CharacterSentiment,
 * CharacterArcs, Editor, WordCount, and the analyze pipeline. Each
 * site rebuilt the same `store.blockOrder.filter(...)` loop.
 *
 * This module centralizes those loops so adding the next derived view
 * is cheap. Selectors are plain functions that READ from `store` —
 * inside a Solid `createMemo` they track the subset of the store they
 * actually touch, so caller-side memoization still works.
 */

import { store, type BlockSentiment } from './document';
import type { Block, UUID } from '@/types';

/**
 * Ordered, non-deleted blocks belonging to the given chapter. Empty
 * array when the chapter doesn't exist or has no blocks.
 */
export function visibleBlocksInChapter(chapterId: UUID): Block[] {
  const out: Block[] = [];
  for (const id of store.blockOrder) {
    const b = store.blocks[id];
    if (!b || b.deleted_at) continue;
    if (b.chapter_id !== chapterId) continue;
    out.push(b);
  }
  return out;
}

/**
 * Every non-deleted block across the manuscript, in persisted order.
 */
export function allVisibleBlocks(): Block[] {
  const out: Block[] = [];
  for (const id of store.blockOrder) {
    const b = store.blocks[id];
    if (!b || b.deleted_at) continue;
    out.push(b);
  }
  return out;
}

/**
 * Dialogue blocks where the given character is the assigned speaker.
 * Ordered. Returns an empty array when the character has no dialogue.
 */
export function dialogueBlocksForSpeaker(characterId: UUID): Block[] {
  const out: Block[] = [];
  for (const id of store.blockOrder) {
    const b = store.blocks[id];
    if (!b || b.deleted_at) continue;
    if (b.type !== 'dialogue' || b.metadata.type !== 'dialogue') continue;
    if (b.metadata.data.speaker_id !== characterId) continue;
    out.push(b);
  }
  return out;
}

export interface LabelTally {
  label: string;
  /** Number of blocks carrying this label. */
  count: number;
  /** Sum of trimmed word counts for blocks with this label. */
  wordCount: number;
  /** Sum of sentiment confidence scores for this label. */
  scoreSum: number;
}

/**
 * Tally sentiment labels for the given chapter. Each label records
 * how many blocks used it, the summed word count of those blocks, and
 * the summed confidence score — enough signal for callers to compute
 * a dominant label by either count or word weight.
 */
export function chapterLabelTally(chapterId: UUID): Map<string, LabelTally> {
  const tally = new Map<string, LabelTally>();
  for (const b of visibleBlocksInChapter(chapterId)) {
    const s: BlockSentiment | undefined = store.sentiments[b.id];
    if (!s) continue;
    const wc = Math.max(1, b.content.trim().split(/\s+/).length);
    const existing = tally.get(s.label);
    if (existing) {
      existing.count += 1;
      existing.wordCount += wc;
      existing.scoreSum += s.score;
    } else {
      tally.set(s.label, {
        label: s.label,
        count: 1,
        wordCount: wc,
        scoreSum: s.score,
      });
    }
  }
  return tally;
}

export interface ChapterDominantLabel {
  label: string;
  /** Share of the winning label in [0,1], either by count or by word weight. */
  share: number;
  /** Number of blocks actually analyzed in the chapter. */
  analyzed: number;
  /** Total non-deleted blocks in the chapter (analyzed or not). */
  total: number;
}

/**
 * Pick the dominant sentiment label for a chapter. `weighted: true`
 * uses word count (long prose outweighs short dialogue); the default
 * `weighted: false` counts blocks uniformly.
 */
export function dominantChapterLabel(
  chapterId: UUID,
  opts: { weighted?: boolean } = {},
): ChapterDominantLabel | null {
  const blocks = visibleBlocksInChapter(chapterId);
  if (blocks.length === 0) return null;
  const tally = chapterLabelTally(chapterId);
  if (tally.size === 0) return null;

  const useWord = !!opts.weighted;
  const entries = [...tally.values()].sort((a, b) =>
    useWord ? b.wordCount - a.wordCount : b.count - a.count,
  );
  const top = entries[0];
  const totalWeight = useWord
    ? entries.reduce((s, e) => s + e.wordCount, 0)
    : entries.reduce((s, e) => s + e.count, 0);
  const share = totalWeight > 0 ? (useWord ? top.wordCount : top.count) / totalWeight : 0;
  const analyzed = entries.reduce((s, e) => s + e.count, 0);
  return {
    label: top.label,
    share,
    analyzed,
    total: blocks.length,
  };
}
