import { describe, expect, it } from 'vitest';
import { compareVersions, meetsVersionGate } from './version';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.0', '1.0.1', -1],
    ['1.0.1', '1.0.0', 1],
    ['1.2.0', '1.10.0', -1],            // numeric, not lexical
    ['0.3.1', '0.3.10', -1],
    ['1.0.0', '1.0', 0],                 // missing components default to 0
    ['1.0.0-beta', '1.0.0', 0],          // pre-release tag stripped
    ['1.0.0-alpha', '1.0.0-beta', 0],    // both strip to 1.0.0
    ['notavalidversion', '0.0.0', 0],   // bad components fall through to 0
  ] as const)('compareVersions(%s, %s) → %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('meetsVersionGate', () => {
  it('passes when no gate is set', () => {
    expect(meetsVersionGate('1.2.3', undefined, undefined)).toBe(true);
  });

  it('passes when running == min (inclusive)', () => {
    expect(meetsVersionGate('0.3.0', '0.3.0', undefined)).toBe(true);
  });

  it('fails when running < min', () => {
    expect(meetsVersionGate('0.2.9', '0.3.0', undefined)).toBe(false);
  });

  it('passes when running == max (inclusive)', () => {
    expect(meetsVersionGate('0.3.0', undefined, '0.3.0')).toBe(true);
  });

  it('fails when running > max', () => {
    expect(meetsVersionGate('0.4.0', undefined, '0.3.5')).toBe(false);
  });

  it('combines min + max correctly', () => {
    expect(meetsVersionGate('0.3.5', '0.3.0', '0.4.0')).toBe(true);
    expect(meetsVersionGate('0.2.0', '0.3.0', '0.4.0')).toBe(false);
    expect(meetsVersionGate('0.5.0', '0.3.0', '0.4.0')).toBe(false);
  });
});
