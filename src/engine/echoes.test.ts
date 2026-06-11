import { describe, it, expect } from 'vitest';
import { analyzeEchoes, type EchoInputBlock } from './echoes';

const block = (id: string, text: string): EchoInputBlock => ({ id, text });

/** Filler with no repeated content words, to space occurrences apart. */
function filler(words: number, seed: string): string {
  return Array.from({ length: words }, (_, i) => `${seed}filler${i}`).join(' ');
}

describe('analyzeEchoes — overused words', () => {
  it('reports a high-count content word with count and rate', () => {
    const text = Array.from(
      { length: 6 },
      (_, i) => `She suddenly turned. ${filler(30, `a${i}`)}`,
    ).join(' ');
    const report = analyzeEchoes([block('b1', text)]);
    const suddenly = report.overused.find((w) => w.term === 'suddenly');
    expect(suddenly).toBeDefined();
    expect(suddenly!.count).toBe(6);
    expect(suddenly!.perThousand).toBeGreaterThan(0);
  });

  it('never reports stopwords, in either language', () => {
    const en = 'the and was were have that '.repeat(40);
    const hu = 'az és volt hogy nem csak már '.repeat(40);
    const report = analyzeEchoes([block('b1', en + hu)]);
    expect(report.overused).toEqual([]);
    expect(report.echoes).toEqual([]);
  });

  it('excludes character names and aliases', () => {
    const text = 'Eszter walked. Eszter spoke. Eszter sang. Eszter left. Eszter wept. Eszter came.';
    const report = analyzeEchoes([block('b1', text)], ['Eszter']);
    expect(report.overused.find((w) => w.term === 'eszter')).toBeUndefined();
    expect(report.echoes.find((e) => e.term === 'eszter')).toBeUndefined();
  });

  it('handles Hungarian accented words as single tokens', () => {
    const text = 'gyönyörű volt. gyönyörű maradt. gyönyörű lesz. gyönyörű volt. gyönyörű ég.';
    const report = analyzeEchoes([block('b1', text)]);
    expect(report.overused.find((w) => w.term === 'gyönyörű')?.count).toBe(5);
  });
});

describe('analyzeEchoes — close echoes', () => {
  it('flags the same word recurring inside the window', () => {
    const text = `The lighthouse stood dark. ${filler(10, 'x')} The lighthouse answered.`;
    const report = analyzeEchoes([block('b1', text)]);
    const echo = report.echoes.find((e) => e.term === 'lighthouse');
    expect(echo).toBeDefined();
    expect(echo!.count).toBe(2);
    expect(echo!.minGapTokens).toBeLessThanOrEqual(60);
  });

  it('does not flag the same word when occurrences are far apart', () => {
    const text = `The lighthouse stood dark. ${filler(120, 'y')} The lighthouse answered.`;
    const report = analyzeEchoes([block('b1', text)]);
    expect(report.echoes.find((e) => e.term === 'lighthouse')).toBeUndefined();
  });

  it('echo windows span block boundaries', () => {
    const report = analyzeEchoes([
      block('b1', 'The mirror cracked.'),
      block('b2', 'She avoided the mirror after that.'),
    ]);
    const echo = report.echoes.find((e) => e.term === 'mirror');
    expect(echo).toBeDefined();
    expect(echo!.blockIds).toEqual(['b1', 'b2']);
  });

  it('a word already reported as overused is not double-reported as an echo', () => {
    const text = 'storm storm storm storm storm storm storm';
    const report = analyzeEchoes([block('b1', text)]);
    expect(report.overused.find((w) => w.term === 'storm')).toBeDefined();
    expect(report.echoes.find((e) => e.term === 'storm')).toBeUndefined();
  });
});

describe('analyzeEchoes — repeated phrases', () => {
  it('reports a 4-gram appearing twice', () => {
    const report = analyzeEchoes([
      block('b1', `She closed the door quietly. ${filler(20, 'p')}`),
      block('b2', `Again she closed the door quietly, listening.`),
    ]);
    const phrase = report.phrases.find((p) => p.phrase.includes('closed the door quietly'));
    expect(phrase).toBeDefined();
    expect(phrase!.count).toBe(2);
    expect(phrase!.blockIds).toEqual(['b1', 'b2']);
  });

  it('subsumes a 3-gram fully inside an equal-count 4-gram', () => {
    const report = analyzeEchoes([
      block('b1', 'He lit the last candle. Later he lit the last candle again. Once more he lit the last candle.'),
    ]);
    const four = report.phrases.find((p) => p.phrase === 'lit the last candle');
    expect(four).toBeDefined();
    // "lit the last" (3-gram, same 3 occurrences) is the same finding.
    expect(report.phrases.find((p) => p.phrase === 'lit the last')).toBeUndefined();
  });

  it('ignores all-stopword n-grams', () => {
    const text = 'and then it was over. and then it was done. and then it was gone.';
    const report = analyzeEchoes([block('b1', text)]);
    expect(report.phrases.find((p) => p.phrase === 'and then it')).toBeUndefined();
  });

  it('phrases never bridge block boundaries', () => {
    const report = analyzeEchoes([
      block('b1', 'It ended with the lighthouse'),
      block('b2', 'keeper gone. It ended with the lighthouse'),
      block('b3', 'keeper found.'),
    ]);
    expect(
      report.phrases.find((p) => p.phrase.includes('lighthouse keeper')),
    ).toBeUndefined();
  });
});

describe('analyzeEchoes — shape', () => {
  it('empty input yields an empty report', () => {
    const report = analyzeEchoes([]);
    expect(report).toEqual({ totalWords: 0, overused: [], echoes: [], phrases: [] });
  });

  it('counts total words across blocks', () => {
    const report = analyzeEchoes([block('b1', 'one two three'), block('b2', 'four five')]);
    expect(report.totalWords).toBe(5);
  });
});
