// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { circleStatus, setCircleStatus, docStatusFor, setDocStatus } from './state';

beforeEach(() => {
  setCircleStatus({ kind: 'unconfigured' });
});

describe('sync state', () => {
  it('starts unconfigured', () => {
    expect(circleStatus().kind).toBe('unconfigured');
  });

  it('transitions to active', () => {
    setCircleStatus({ kind: 'active', syncId: 'abc' });
    expect(circleStatus()).toEqual({ kind: 'active', syncId: 'abc' });
  });

  it('transitions to pairing', () => {
    setCircleStatus({ kind: 'pairing', paircode: 'ABCDEF', expiresAt: 1000 });
    expect(circleStatus()).toEqual({ kind: 'pairing', paircode: 'ABCDEF', expiresAt: 1000 });
  });

  it('per-doc status defaults to off', () => {
    expect(docStatusFor('unknown-doc').kind).toBe('off');
  });

  it('per-doc status updates and reads back', () => {
    setDocStatus('doc-1', { kind: 'syncing' });
    expect(docStatusFor('doc-1').kind).toBe('syncing');
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 1000, revision: 4 });
    expect(docStatusFor('doc-1')).toEqual({ kind: 'idle', lastSyncedAt: 1000, revision: 4 });
  });

  it('per-doc status is independent across docs', () => {
    setDocStatus('doc-1', { kind: 'syncing' });
    setDocStatus('doc-2', { kind: 'pending' });
    expect(docStatusFor('doc-1').kind).toBe('syncing');
    expect(docStatusFor('doc-2').kind).toBe('pending');
  });

  it('conflict status carries revision metadata', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 4, serverRevision: 9 });
    const s = docStatusFor('doc-1');
    expect(s.kind).toBe('conflict');
    if (s.kind === 'conflict') {
      expect(s.localRevision).toBe(4);
      expect(s.serverRevision).toBe(9);
    }
  });
});
