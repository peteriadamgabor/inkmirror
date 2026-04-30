import { describe, expect, it } from 'vitest';
import { pickLocalized } from './localize';

describe('pickLocalized', () => {
  it('returns the requested locale when present', () => {
    expect(pickLocalized({ en: 'Hello', hu: 'Helló' }, 'hu')).toBe('Helló');
  });

  it('falls back to English when the requested locale is missing', () => {
    expect(pickLocalized({ en: 'Hello' }, 'hu')).toBe('Hello');
  });

  it('falls back to the first available key when both en and the requested are missing', () => {
    expect(pickLocalized({ de: 'Hallo' }, 'hu')).toBe('Hallo');
  });

  it('returns empty string when the field is empty', () => {
    expect(pickLocalized({}, 'en')).toBe('');
  });

  it('skips empty-string entries when falling back', () => {
    expect(pickLocalized({ en: '', hu: '', de: 'Hallo' }, 'fr')).toBe('Hallo');
  });
});
