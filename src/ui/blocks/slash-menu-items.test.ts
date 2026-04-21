import { describe, it, expect } from 'vitest';
import { filterSlashItems, type SlashMenuItem } from './slash-menu-items';

const ITEMS: SlashMenuItem[] = [
  { type: 'text',     label: 'TEXT',     hint: 'prose' },
  { type: 'dialogue', label: 'DIALOGUE', hint: 'speech' },
  { type: 'scene',    label: 'SCENE',    hint: 'heading' },
  { type: 'note',     label: 'NOTE',     hint: 'private' },
];

describe('filterSlashItems', () => {
  it('returns every item when filter is empty', () => {
    expect(filterSlashItems(ITEMS, '')).toHaveLength(4);
  });

  it('filters by label prefix case-insensitively', () => {
    expect(filterSlashItems(ITEMS, 'di').map((i) => i.type)).toEqual(['dialogue']);
    expect(filterSlashItems(ITEMS, 'TE').map((i) => i.type)).toEqual(['text']);
  });

  it('also matches the raw type key (works across languages)', () => {
    // A translated label like "PÁRBESZÉD" still matches prefix "di"
    // because we also check the type key.
    const hu: SlashMenuItem[] = [
      { type: 'dialogue', label: 'PÁRBESZÉD', hint: '' },
    ];
    expect(filterSlashItems(hu, 'di').map((i) => i.type)).toEqual(['dialogue']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterSlashItems(ITEMS, 'zzz')).toEqual([]);
  });
});
