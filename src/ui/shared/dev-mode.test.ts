import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDevModeEnabled, disableDevMode, _refreshDevMode } from './dev-mode';

const KEY = 'inkmirror.dev';
const PASS = 'two-hearts-one-soul';

describe('dev-mode', () => {
  beforeEach(() => {
    localStorage.clear();
    _refreshDevMode();
  });

  afterEach(() => {
    localStorage.clear();
    _refreshDevMode();
  });

  it('returns false when key is missing', () => {
    _refreshDevMode();
    expect(isDevModeEnabled()).toBe(false);
  });

  it('returns true when localStorage matches the passphrase', () => {
    localStorage.setItem(KEY, PASS);
    _refreshDevMode();
    expect(isDevModeEnabled()).toBe(true);
  });

  it('returns false when key holds a wrong value', () => {
    localStorage.setItem(KEY, 'something-else');
    _refreshDevMode();
    expect(isDevModeEnabled()).toBe(false);
  });

  it('disableDevMode clears the key and flips the signal', () => {
    localStorage.setItem(KEY, PASS);
    _refreshDevMode();
    expect(isDevModeEnabled()).toBe(true);

    disableDevMode();
    expect(isDevModeEnabled()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
