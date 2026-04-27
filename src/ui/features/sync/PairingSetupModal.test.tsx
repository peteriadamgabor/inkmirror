// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { PairingSetupModal } from './PairingSetupModal';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('PairingSetupModal', () => {
  it('renders the passphrase step initially', () => {
    const { getByPlaceholderText } = render(() => <PairingSetupModal onClose={() => {}} />);
    expect(getByPlaceholderText('Passphrase')).toBeTruthy();
    expect(getByPlaceholderText('Confirm')).toBeTruthy();
  });

  it('rejects mismatched passphrases', async () => {
    const { getByPlaceholderText, getByText, container } = render(() => (
      <PairingSetupModal onClose={() => {}} />
    ));
    const pp = getByPlaceholderText('Passphrase') as HTMLInputElement;
    const cf = getByPlaceholderText('Confirm') as HTMLInputElement;
    fireEvent.input(pp, { target: { value: 'long-enough-passphrase' } });
    fireEvent.input(cf, { target: { value: 'different-passphrase-here' } });
    fireEvent.click(getByText('Confirm'));
    await Promise.resolve();
    expect(container.textContent).toMatch(/don't match/);
  });

  it('rejects weak passphrases', async () => {
    const { getByPlaceholderText, getByText, container } = render(() => (
      <PairingSetupModal onClose={() => {}} />
    ));
    const pp = getByPlaceholderText('Passphrase') as HTMLInputElement;
    const cf = getByPlaceholderText('Confirm') as HTMLInputElement;
    fireEvent.input(pp, { target: { value: 'short' } });
    fireEvent.input(cf, { target: { value: 'short' } });
    fireEvent.click(getByText('Confirm'));
    await Promise.resolve();
    expect(container.textContent).toMatch(/stronger/);
  });

  it('Generate button fills both fields with matching value', () => {
    const { getByText, getByPlaceholderText } = render(() => (
      <PairingSetupModal onClose={() => {}} />
    ));
    fireEvent.click(getByText('Generate strong passphrase'));
    const pp = getByPlaceholderText('Passphrase') as HTMLInputElement;
    const cf = getByPlaceholderText('Confirm') as HTMLInputElement;
    expect(pp.value).toBe(cf.value);
    expect(pp.value.length).toBeGreaterThan(15);
  });

  it('Cancel calls onClose', () => {
    const onClose = vi.fn();
    const { getByText } = render(() => <PairingSetupModal onClose={onClose} />);
    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
