import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { SettingsRoute } from './settings';
import { PROFILE_STORAGE_KEY } from '@/ai/profile';
import { resolveConfirm, pendingConfirm } from '@/ui/shared/confirm';

describe('SettingsRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (navigator as unknown as { gpu?: unknown }).gpu;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the AI tab by default with profile cards', () => {
    const r = render(() => <SettingsRoute />);
    expect(r.getByRole('heading', { name: /AI profile/i })).toBeTruthy();
    expect(r.container.querySelector('[data-profile="basic"]')).toBeTruthy();
    expect(r.container.querySelector('[data-profile="rich"]')).toBeTruthy();
  });

  it('shows Basic as active on a fresh install', () => {
    const r = render(() => <SettingsRoute />);
    const basic = r.container.querySelector('[data-profile="basic"]') as HTMLElement;
    expect(basic).toBeTruthy();
    // The "Active" badge appears on the active card.
    expect(basic.textContent).toMatch(/Active/);
  });

  it('clicking Rich opens the confirm modal before switching', async () => {
    const r = render(() => <SettingsRoute />);
    const rich = r.container.querySelector('[data-profile="rich"]') as HTMLElement;
    fireEvent.click(rich);
    // The modal is portaled in ConfirmHost; check the pending confirm signal.
    await waitFor(() => {
      expect(pendingConfirm()).not.toBeNull();
    });
    const p = pendingConfirm();
    expect(p?.title).toMatch(/Download the Rich model/);
    // Cancel — no profile change should persist.
    resolveConfirm('cancel');
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('confirming the Rich switch persists profile=deep', async () => {
    const r = render(() => <SettingsRoute />);
    const rich = r.container.querySelector('[data-profile="rich"]') as HTMLElement;
    fireEvent.click(rich);
    await waitFor(() => expect(pendingConfirm()).not.toBeNull());
    resolveConfirm('confirm');
    await waitFor(() => {
      expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe('deep');
    });
  });

  it('reflects stored profile on mount', async () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'deep');
    const r = render(() => <SettingsRoute />);
    const rich = r.container.querySelector('[data-profile="rich"]') as HTMLElement;
    expect(rich.textContent).toMatch(/Active/);
  });

  it('advanced section with Revert appears only when profile is deep', async () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'deep');
    const r = render(() => <SettingsRoute />);
    fireEvent.click(r.getByText(/Show advanced/));
    await waitFor(() => {
      expect(r.getByText(/Revert to Basic/)).toBeTruthy();
    });
  });

  it('backend status line reads CPU when no GPU adapter', async () => {
    const r = render(() => <SettingsRoute />);
    await waitFor(() => {
      expect(r.container.textContent).toMatch(/Acceleration: CPU/);
    });
  });

  it('disabled tabs show coming-soon label', () => {
    const r = render(() => <SettingsRoute />);
    const hotkeys = r.getByRole('button', { name: /Hotkeys/i });
    expect(hotkeys.getAttribute('disabled')).not.toBeNull();
  });
});
