// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { ConflictModal } from './ConflictModal';
import { setDocStatus } from '@/sync/state';

beforeEach(() => {
  setDocStatus('doc-1', { kind: 'conflict', localRevision: 4, serverRevision: 9 });
});

const baseProps = {
  docId: 'doc-1',
  docTitle: 'Cathedral of Bones',
  localRevision: 4,
  serverRevision: 9,
  localUpdatedAt: Date.now() - 4 * 60_000,
  serverUpdatedAt: Date.now() - 2 * 60_000,
  onClose: () => {},
};

describe('ConflictModal', () => {
  it('renders title and the doc name in intro', () => {
    const { getByText, container } = render(() => <ConflictModal {...baseProps} />);
    expect(getByText('Sync conflict')).toBeTruthy();
    expect(container.textContent).toMatch(/Cathedral of Bones/);
  });

  it('shows revision counts for both sides', () => {
    const { container } = render(() => <ConflictModal {...baseProps} />);
    expect(container.textContent).toMatch(/revision 4/);
    expect(container.textContent).toMatch(/revision 9/);
  });

  it('hides Save mine as a copy when onSaveAsCopy is omitted', () => {
    const { container } = render(() => <ConflictModal {...baseProps} />);
    expect(container.textContent).not.toMatch(/Save mine as a copy/);
  });

  it('shows Save mine as a copy when onSaveAsCopy is provided', () => {
    const onSaveAsCopy = vi.fn();
    const { getByText } = render(() => <ConflictModal {...baseProps} onSaveAsCopy={onSaveAsCopy} />);
    fireEvent.click(getByText(/Save mine as a copy/));
    expect(onSaveAsCopy).toHaveBeenCalled();
  });

  it('Decide later button calls onClose', () => {
    const onClose = vi.fn();
    const { getByText } = render(() => <ConflictModal {...baseProps} onClose={onClose} />);
    fireEvent.click(getByText('Decide later'));
    return new Promise<void>((r) => setTimeout(r, 50)).then(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays This device and Server labels', () => {
    const { container } = render(() => <ConflictModal {...baseProps} />);
    expect(container.textContent).toMatch(/This device/);
    expect(container.textContent).toMatch(/Server/);
  });

  it('shows the warning text', () => {
    const { container } = render(() => <ConflictModal {...baseProps} />);
    expect(container.textContent).toMatch(/Whichever version you discard/);
  });

  it('shows Keep this device\'s version and Pull the server version buttons', () => {
    const { getByText } = render(() => <ConflictModal {...baseProps} />);
    expect(getByText("Keep this device's version")).toBeTruthy();
    expect(getByText('Pull the server version')).toBeTruthy();
  });

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn();
    const { container } = render(() => <ConflictModal {...baseProps} onClose={onClose} />);
    // The backdrop is the outermost div inside the render container
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking panel does not call onClose', () => {
    const onClose = vi.fn();
    const { container } = render(() => <ConflictModal {...baseProps} onClose={onClose} />);
    const panel = container.querySelector('.inkmirror-modal-panel') as HTMLElement;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});
