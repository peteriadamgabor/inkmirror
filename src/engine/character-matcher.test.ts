import { describe, it, expect } from 'vitest';
import { findMentions } from './character-matcher';
import type { Character } from '@/types';

function makeChar(id: string, name: string, aliases: string[] = []): Character {
  return {
    id,
    document_id: 'doc',
    name,
    aliases,
    notes: '',
    color: '#000',
    created_at: '',
    updated_at: '',
  };
}

describe('findMentions', () => {
  const marton = makeChar('c1', 'Márton');
  const reka = makeChar('c2', 'Réka', ['Rékácska']);
  const bela = makeChar('c3', 'Béla');

  it('returns empty for empty text', () => {
    expect(findMentions('', [marton, reka])).toEqual([]);
  });

  it('returns empty for empty character list', () => {
    expect(findMentions('Márton sétált.', [])).toEqual([]);
  });

  it('matches an exact Hungarian name', () => {
    expect(findMentions('Márton hazaért.', [marton])).toEqual(['c1']);
  });

  it('matches case-insensitively', () => {
    expect(findMentions('márton hazaért.', [marton])).toEqual(['c1']);
    expect(findMentions('MÁRTON hazaért.', [marton])).toEqual(['c1']);
  });

  it('matches multiple characters in one sentence', () => {
    const ids = findMentions('Márton és Réka együtt voltak.', [marton, reka, bela]).sort();
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('matches an alias', () => {
    expect(findMentions('Hol van Rékácska?', [reka])).toEqual(['c2']);
  });

  it('prefers the longer alias when names overlap', () => {
    // both "Réka" and "Rékácska" would fire; we want the single character
    // to be reported once, not twice
    expect(findMentions('Rékácska sétált.', [reka])).toEqual(['c2']);
  });

  it('requires a whole-word match (no substring false positive)', () => {
    // "Rékafogás" should NOT match "Réka" because the character after
    // "Réka" is a letter
    expect(findMentions('Rékafogás izgalmas volt.', [reka])).toEqual([]);
  });

  it('handles punctuation around the name as a word boundary', () => {
    expect(findMentions('"Márton", mondta.', [marton])).toEqual(['c1']);
    expect(findMentions('Márton.', [marton])).toEqual(['c1']);
    expect(findMentions('(Márton)', [marton])).toEqual(['c1']);
  });

  it('does not match a name that is part of another word with accents', () => {
    // "Bélavár" should NOT match "Béla" — á is a letter in unicode
    expect(findMentions('Bélavárba mentek.', [bela])).toEqual([]);
  });

  it('trims and ignores empty names/aliases', () => {
    const messy = makeChar('c4', '   ', ['', '  ']);
    expect(findMentions('Bármi szöveg.', [messy])).toEqual([]);
  });
});
