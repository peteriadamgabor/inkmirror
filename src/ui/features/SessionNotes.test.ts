import { describe, it, expect, beforeEach } from 'vitest';
import { __test } from './SessionNotes';

const { storageKey, readNotes, writeNotes } = __test;

describe('SessionNotes persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('storageKey is scoped by document id', () => {
    expect(storageKey('doc-a')).toBe('inkmirror.sessionNotes.doc-a');
    expect(storageKey('doc-b')).toBe('inkmirror.sessionNotes.doc-b');
    expect(storageKey('doc-a')).not.toBe(storageKey('doc-b'));
  });

  it('readNotes returns empty string for an unseen document', () => {
    expect(readNotes('never-saved')).toBe('');
  });

  it('writeNotes + readNotes roundtrip', () => {
    writeNotes('doc-1', 'Something to remember.');
    expect(readNotes('doc-1')).toBe('Something to remember.');
  });

  it('writeNotes with empty string clears the entry', () => {
    writeNotes('doc-1', 'draft');
    expect(localStorage.getItem(storageKey('doc-1'))).toBe('draft');
    writeNotes('doc-1', '');
    expect(localStorage.getItem(storageKey('doc-1'))).toBeNull();
  });

  it('notes are per-document — no cross-contamination', () => {
    writeNotes('doc-a', 'alpha');
    writeNotes('doc-b', 'beta');
    expect(readNotes('doc-a')).toBe('alpha');
    expect(readNotes('doc-b')).toBe('beta');
  });
});
