// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { PairRedeemModal } from './PairRedeemModal';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PairRedeemModal', () => {
  it('renders both inputs and the connect button', () => {
    const { getByPlaceholderText, getByText } = render(() => <PairRedeemModal onClose={() => {}} />);
    expect(getByPlaceholderText('Pair code')).toBeTruthy();
    expect(getByPlaceholderText('Passphrase')).toBeTruthy();
    expect(getByText('Connect')).toBeTruthy();
  });

  it('Cancel calls onClose', () => {
    const onClose = vi.fn();
    const { getByText } = render(() => <PairRedeemModal onClose={onClose} />);
    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects malformed paircode without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { getByPlaceholderText, getByText, container } = render(() => (
      <PairRedeemModal onClose={() => {}} />
    ));
    // "0000" — all four chars are excluded from the Crockford alphabet
    fireEvent.input(getByPlaceholderText('Pair code') as HTMLInputElement, {
      target: { value: '0000' },
    });
    fireEvent.input(getByPlaceholderText('Passphrase') as HTMLInputElement, {
      target: { value: 'hello' },
    });
    fireEvent.click(getByText('Connect'));
    await Promise.resolve();

    expect(container.textContent).toMatch(/expired|invalid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows Retry button when paircode is malformed (expired path)', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(() => (
      <PairRedeemModal onClose={() => {}} />
    ));
    fireEvent.input(getByPlaceholderText('Pair code') as HTMLInputElement, {
      target: { value: '000' },
    });
    fireEvent.input(getByPlaceholderText('Passphrase') as HTMLInputElement, {
      target: { value: 'hello' },
    });
    fireEvent.click(getByText('Connect'));
    await Promise.resolve();

    expect(queryByText('Try again')).toBeTruthy();
  });

  it('Retry button resets the form', async () => {
    const { getByPlaceholderText, getByText } = render(() => (
      <PairRedeemModal onClose={() => {}} />
    ));
    const paircodeInput = getByPlaceholderText('Pair code') as HTMLInputElement;
    fireEvent.input(paircodeInput, { target: { value: '000' } });
    fireEvent.input(getByPlaceholderText('Passphrase') as HTMLInputElement, {
      target: { value: 'hello' },
    });
    fireEvent.click(getByText('Connect'));
    await Promise.resolve();

    fireEvent.click(getByText('Try again'));
    expect(paircodeInput.value).toBe('');
  });

  it('shows 401 error and clears passphrase, keeps paircode', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ syncId: 's1', salt: 'AQIDBAUGBwgJCgsMDQ4PEA' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getByPlaceholderText, getByText, container } = render(() => (
      <PairRedeemModal onClose={() => {}} />
    ));
    const paircodeInput = getByPlaceholderText('Pair code') as HTMLInputElement;
    const passInput = getByPlaceholderText('Passphrase') as HTMLInputElement;
    // "ABCDEF" is valid in the Crockford alphabet
    fireEvent.input(paircodeInput, { target: { value: 'ABCDEF' } });
    fireEvent.input(passInput, { target: { value: 'wrong-passphrase-here' } });
    fireEvent.click(getByText('Connect'));

    // Wait for Argon2id to derive + the 401 to come back
    await new Promise((r) => setTimeout(r, 30_000));

    expect(container.textContent).toMatch(/doesn't match|Try again/i);
    // Passphrase cleared
    expect(passInput.value).toBe('');
    // Paircode preserved
    expect(paircodeInput.value).toBe('ABCDEF');
    // No "Try again" retry button (not an expired code — just a wrong passphrase)
    expect(container.textContent).not.toMatch(/^Try again/);
  }, 35_000);

  it('normalizes paircode (lowercase + dashes stripped) and submits with uppercase', async () => {
    // "abc-def" → strip dash, uppercase → "ABCDEF" (all valid Crockford chars)
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ syncId: 'test', salt: 'AQIDBAUGBwgJCgsMDQ4PEA' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ).mockResolvedValueOnce(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getByPlaceholderText, getByText } = render(() => (
      <PairRedeemModal onClose={() => {}} />
    ));
    fireEvent.input(getByPlaceholderText('Pair code') as HTMLInputElement, {
      target: { value: 'abc-def' },
    });
    fireEvent.input(getByPlaceholderText('Passphrase') as HTMLInputElement, {
      target: { value: 'long-enough-passphrase' },
    });
    fireEvent.click(getByText('Connect'));

    // Short-circuit: just wait enough for the first fetch call (redeemPaircode /sync/pair/redeem)
    // before Argon2id finishes. The redeem call fires synchronously once the form submits;
    // Argon2id races to completion in the background and the test cleanup handles it.
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0];
    expect(String(firstCall[0])).toContain('/sync/pair/redeem');
    const body = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(body.paircode).toBe('ABCDEF');
  });
});
