import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasVisited,
  markVisited,
  landingRedirectBounced,
  markLandingRedirect,
} from './first-visit';

describe('first-visit', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reports not-visited on a fresh browser, visited after marking', () => {
    expect(hasVisited()).toBe(false);
    markVisited();
    expect(hasVisited()).toBe(true);
  });

  describe('landing redirect loop guard', () => {
    it('allows the first redirect attempt', () => {
      expect(landingRedirectBounced()).toBe(false);
    });

    it('blocks a second redirect after the first bounce', () => {
      markLandingRedirect();
      expect(landingRedirectBounced()).toBe(true);
    });

    it('keeps the guard per-session, independent of the visited marker', () => {
      markLandingRedirect();
      expect(hasVisited()).toBe(false);
      expect(landingRedirectBounced()).toBe(true);
    });
  });
});
