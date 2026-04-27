// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { SyncStatusPill } from './SyncStatusPill';
import { setDocStatus } from '@/sync/state';

beforeEach(() => {
  setDocStatus('doc-1', { kind: 'off' });
});

describe('SyncStatusPill', () => {
  it('renders nothing when sync is off', () => {
    setDocStatus('doc-1', { kind: 'off' });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent?.trim()).toBe('');
  });

  it('renders the syncing label', () => {
    setDocStatus('doc-1', { kind: 'syncing' });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent).toMatch(/⟳/);
  });

  it('renders the pending label', () => {
    setDocStatus('doc-1', { kind: 'pending' });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent).toMatch(/pending/i);
  });

  it('renders the idle label with timestamp', () => {
    setDocStatus('doc-1', { kind: 'idle', lastSyncedAt: Date.now() - 120_000, revision: 3 });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent).toMatch(/✓/);
    expect(container.textContent).toMatch(/synced/i);
  });

  it('renders conflict label as a button', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 2, serverRevision: 3 });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent).toMatch(/⚠/);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('calls onClickConflict when conflict button is clicked', () => {
    setDocStatus('doc-1', { kind: 'conflict', localRevision: 2, serverRevision: 3 });
    let clicked = false;
    const { container } = render(() => (
      <SyncStatusPill docId="doc-1" onClickConflict={() => { clicked = true; }} />
    ));
    (container.querySelector('button') as HTMLButtonElement).click();
    expect(clicked).toBe(true);
  });

  it('renders error label', () => {
    setDocStatus('doc-1', { kind: 'error', message: 'http 503' });
    const { container } = render(() => <SyncStatusPill docId="doc-1" />);
    expect(container.textContent).toMatch(/!/);
  });
});
