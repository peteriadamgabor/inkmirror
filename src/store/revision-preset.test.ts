import { describe, it, expect, beforeEach } from 'vitest';
import {
  REVISION_PRESETS,
  getRevisionPreset,
  setRevisionPreset,
  getActiveGates,
} from './revision-preset';

describe('revision-preset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to balanced when localStorage is empty', () => {
    expect(getRevisionPreset()).toBe('balanced');
    const gates = getActiveGates();
    expect(gates.timeMs).toBe(60_000);
    expect(gates.distanceChars).toBe(30);
  });

  it('persists a chosen preset to localStorage', () => {
    setRevisionPreset('sparse');
    expect(localStorage.getItem('inkmirror.revisionPreset')).toBe('sparse');
    expect(getRevisionPreset()).toBe('sparse');
    expect(getActiveGates().timeMs).toBe(120_000);
  });

  it('falls back to balanced when localStorage holds garbage', () => {
    localStorage.setItem('inkmirror.revisionPreset', 'cosmic');
    expect(getRevisionPreset()).toBe('balanced');
  });

  it('exposes all three presets in REVISION_PRESETS', () => {
    expect(REVISION_PRESETS).toEqual(['frequent', 'balanced', 'sparse']);
  });
});
