import { describe, it, expect } from 'vitest';
import { splitSentences, firstSentence, lastSentence } from './sentence';

describe('splitSentences', () => {
  it('splits on terminal punctuation', () => {
    expect(splitSentences('She left. He stayed. The door closed.')).toEqual([
      'She left.',
      'He stayed.',
      'The door closed.',
    ]);
  });

  it('handles !, ?, and ellipsis as terminators', () => {
    expect(splitSentences('Run! Why? Wait…')).toEqual(['Run!', 'Why?', 'Wait…']);
  });

  it('treats runs like ?! and ... as a single boundary', () => {
    expect(splitSentences('Really?! No... Yes.')).toEqual(['Really?!', 'No...', 'Yes.']);
  });

  it('keeps a trailing closing quote with its sentence', () => {
    expect(splitSentences('"Go," she said. "Now."')).toEqual(['"Go," she said.', '"Now."']);
  });

  it('collapses soft line breaks and extra whitespace', () => {
    expect(splitSentences('First line.\nSecond   line.')).toEqual([
      'First line.',
      'Second line.',
    ]);
  });

  it('returns a terminator-less fragment whole', () => {
    expect(splitSentences('no ending here')).toEqual(['no ending here']);
  });

  it('returns [] for empty or whitespace-only input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n  ')).toEqual([]);
  });

  it('splits Hungarian prose on the same punctuation', () => {
    expect(splitSentences('Elment. Ott maradt. Becsukódott az ajtó.')).toEqual([
      'Elment.',
      'Ott maradt.',
      'Becsukódott az ajtó.',
    ]);
  });
});

describe('firstSentence / lastSentence', () => {
  it('extract the opening and closing sentence', () => {
    const text = 'The morning broke cold. Hours passed. She did not turn back.';
    expect(firstSentence(text)).toBe('The morning broke cold.');
    expect(lastSentence(text)).toBe('She did not turn back.');
  });

  it('return the whole text when there is no terminator', () => {
    expect(firstSentence('a single clause')).toBe('a single clause');
    expect(lastSentence('a single clause')).toBe('a single clause');
  });

  it('return empty string for empty input', () => {
    expect(firstSentence('')).toBe('');
    expect(lastSentence('   ')).toBe('');
  });

  it('coincide for a single-sentence block', () => {
    expect(firstSentence('Only one.')).toBe('Only one.');
    expect(lastSentence('Only one.')).toBe('Only one.');
  });
});
