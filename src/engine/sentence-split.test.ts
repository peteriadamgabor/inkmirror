import { describe, it, expect } from 'vitest';
import { splitSentences } from './sentence-split';

describe('splitSentences', () => {
  it('splits on period + space', () => {
    expect(splitSentences('One. Two. Three.')).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('splits on question and exclamation marks', () => {
    expect(splitSentences('Why? Because! Right.')).toEqual(['Why?', 'Because!', 'Right.']);
  });

  it('handles ellipses as sentence-ending', () => {
    const parts = splitSentences('He paused… Then he spoke.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/paused/);
    expect(parts[1]).toMatch(/spoke/);
  });

  it('does not split on common English abbreviations', () => {
    expect(splitSentences('Dr. Smith visited Mr. Jones.')).toEqual([
      'Dr. Smith visited Mr. Jones.',
    ]);
    expect(splitSentences('See Fig. 2 for details.')).toEqual(['See Fig. 2 for details.']);
  });

  it('does not split on Hungarian abbreviations', () => {
    expect(splitSentences('Prof. Kovács írta. Most már tudom.')).toEqual([
      'Prof. Kovács írta.',
      'Most már tudom.',
    ]);
  });

  it('handles Hungarian sentence enders with accented letters', () => {
    const parts = splitSentences('Ő jött. Tőle hallottam.');
    expect(parts).toEqual(['Ő jött.', 'Tőle hallottam.']);
  });

  it('does not split on em-dashes between clauses', () => {
    expect(splitSentences('Ivan — who was tired — sat down.')).toEqual([
      'Ivan — who was tired — sat down.',
    ]);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(splitSentences('  Hi there.  ')).toEqual(['Hi there.']);
  });

  it('returns empty array for empty or whitespace input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n\t ')).toEqual([]);
  });

  it('handles a sentence without a terminator at end of text', () => {
    expect(splitSentences('Final thought')).toEqual(['Final thought']);
  });

  it('collapses internal newlines within a sentence', () => {
    expect(splitSentences('Line one\ncontinues. Line two.')).toEqual([
      'Line one continues.',
      'Line two.',
    ]);
  });

  it('preserves quoted punctuation as sentence boundary', () => {
    const parts = splitSentences('She said, "I will." He nodded.');
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.join(' ')).toContain('I will');
    expect(parts.join(' ')).toContain('He nodded');
  });
});
