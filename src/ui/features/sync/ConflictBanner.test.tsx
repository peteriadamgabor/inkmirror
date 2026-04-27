// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { ConflictBanner } from './ConflictBanner';
import { setDocStatus } from '@/sync/state';

beforeEach(() => {
  setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 1 });
});

describe('ConflictBanner', () => {
  it('renders nothing when doc is not in conflict', () => {
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: 0, revision: 1 });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.textContent?.trim()).toBe('');
  });

  it('renders nothing when sync is off', () => {
    setDocStatus('doc-1', { kind: 'off' });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.textContent?.trim()).toBe('');
  });

  it('renders nothing when syncing', () => {
    setDocStatus('doc-1', { kind: 'syncing' });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.textContent?.trim()).toBe('');
  });

  it('renders the banner when in conflict', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 1, serverRevision: 2 });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.textContent).toMatch(/⚠/);
  });

  it('renders conflict banner text', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 1, serverRevision: 2 });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.textContent).toMatch(/conflict/i);
  });

  it('calls onClick when clicked', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 1, serverRevision: 2 });
    const onClick = vi.fn();
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={onClick} />);
    const btn = container.querySelector('button')!;
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders as a button element', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 1, serverRevision: 2 });
    const { container } = render(() => <ConflictBanner docId="doc-1" onClick={() => {}} />);
    expect(container.querySelector('button')).not.toBeNull();
  });
});
