import { describe, it, expect } from 'vitest';
import { generateSyntheticDoc } from './synthetic';

describe('generateSyntheticDoc', () => {
  const opts = {
    chapterCount: 10,
    blocksPerChapter: 50,
    wordsPerBlock: 200,
    typeDistribution: { text: 0.6, dialogue: 0.25, scene: 0.1, note: 0.05 },
    seed: 42,
  };

  it('generates the requested number of chapters', () => {
    const { chapters } = generateSyntheticDoc(opts);
    expect(chapters).toHaveLength(10);
  });

  it('generates the requested number of blocks per chapter', () => {
    const { blocks } = generateSyntheticDoc(opts);
    expect(blocks).toHaveLength(10 * 50);
  });

  it('is deterministic for a given seed', () => {
    const a = generateSyntheticDoc(opts);
    const b = generateSyntheticDoc(opts);
    expect(a.blocks[0].content).toBe(b.blocks[0].content);
    expect(a.blocks[123].content).toBe(b.blocks[123].content);
  });

  it('produces different content for different seeds', () => {
    const a = generateSyntheticDoc(opts);
    const b = generateSyntheticDoc({ ...opts, seed: 1 });
    expect(a.blocks[0].content).not.toBe(b.blocks[0].content);
  });

  it('roughly matches the type distribution', () => {
    const { blocks } = generateSyntheticDoc(opts);
    const counts = { text: 0, dialogue: 0, scene: 0, note: 0 };
    for (const b of blocks) counts[b.type]++;
    const total = blocks.length;
    expect(counts.text / total).toBeCloseTo(0.6, 1);
    expect(counts.dialogue / total).toBeCloseTo(0.25, 1);
    expect(counts.scene / total).toBeCloseTo(0.1, 1);
    expect(counts.note / total).toBeCloseTo(0.05, 1);
  });

  it('gives every block a non-empty content string', () => {
    const { blocks } = generateSyntheticDoc(opts);
    for (const b of blocks) expect(b.content.length).toBeGreaterThan(0);
  });
});
