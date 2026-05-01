import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { BlockHistoryRow } from './BlockHistoryRow';

describe('BlockHistoryRow', () => {
  afterEach(() => cleanup());

  const baseRev = (overrides: Record<string, unknown> = {}) => ({
    blockId: 'b1',
    documentId: 'd1',
    content: 'the dark night',
    snapshotAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    ...overrides,
  });

  it('renders initial-snapshot label when prev is undefined', () => {
    const { getByText } = render(() => (
      <BlockHistoryRow rev={baseRev()} prev={undefined} liveContent="x" onSelect={() => {}} isPreviewing={false} />
    ));
    expect(getByText(/initial/i)).toBeTruthy();
  });

  it('renders mini-diff with add/remove segments for a small rewrite', () => {
    const prev = baseRev({ content: 'the dark night' });
    const rev = baseRev({ content: 'the cold dawn' });
    const { container } = render(() => (
      <BlockHistoryRow rev={rev} prev={prev} liveContent="x" onSelect={() => {}} isPreviewing={false} />
    ));
    const removed = container.querySelectorAll('.line-through');
    expect(removed.length).toBeGreaterThan(0);
  });

  it('renders major-rewrite fallback when more than 10 segments differ', () => {
    const prev = baseRev({ content: 'a b c d e f g h i j k l m n o p' });
    const rev = baseRev({ content: '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16' });
    const { getByText } = render(() => (
      <BlockHistoryRow rev={rev} prev={prev} liveContent="x" onSelect={() => {}} isPreviewing={false} />
    ));
    expect(getByText(/major rewrite/i)).toBeTruthy();
  });

  it('calls onSelect with the revision when clicked', () => {
    const onSelect = vi.fn();
    const rev = baseRev();
    const { getByRole } = render(() => (
      <BlockHistoryRow rev={rev} prev={undefined} liveContent="x" onSelect={onSelect} isPreviewing={false} />
    ));
    fireEvent.click(getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(rev);
  });

  it('marks the row as currently-live when content matches liveContent', () => {
    const rev = baseRev({ content: 'same' });
    const { getByRole } = render(() => (
      <BlockHistoryRow rev={rev} prev={undefined} liveContent="same" onSelect={() => {}} isPreviewing={false} />
    ));
    const btn = getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
