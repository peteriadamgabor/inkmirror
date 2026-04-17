import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { SettingsModal } from './SettingsModal';
import {
  openSettingsModal,
  setSettingsModalOpen,
  setSettingsModalTab,
} from '@/store/ui-state';
import { PROFILE_STORAGE_KEY } from '@/ai/profile';
import { pendingConfirm, resolveConfirm } from '@/ui/shared/confirm';
import { lang, setLang } from '@/i18n';

describe('SettingsModal', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (navigator as unknown as { gpu?: unknown }).gpu;
    setSettingsModalOpen(false);
    setSettingsModalTab('ai');
  });

  afterEach(() => {
    setSettingsModalOpen(false);
    cleanup();
  });

  it('renders nothing when closed', () => {
    const r = render(() => <SettingsModal />);
    expect(r.container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders profile cards when opened', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => {
      expect(r.container.querySelector('[role="dialog"]')).toBeTruthy();
    });
    expect(r.container.querySelector('[data-profile="basic"]')).toBeTruthy();
    expect(r.container.querySelector('[data-profile="rich"]')).toBeTruthy();
  });

  it('shows Basic as active on a fresh install', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    const basic = r.container.querySelector('[data-profile="basic"]') as HTMLElement;
    expect(basic.textContent).toMatch(/Active/);
  });

  it('clicking the backdrop closes the modal', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    const backdrop = r.container.querySelector(
      '.inkmirror-modal-backdrop',
    ) as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(r.container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('close button closes the modal', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    const close = r.getByLabelText(/close/i);
    fireEvent.click(close);
    await waitFor(() => {
      expect(r.container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  it('clicking Rich opens the confirm modal', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    const rich = r.container.querySelector('[data-profile="rich"]') as HTMLElement;
    fireEvent.click(rich);
    await waitFor(() => expect(pendingConfirm()).not.toBeNull());
    resolveConfirm('cancel');
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('confirming Rich persists profile=deep', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
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
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    const rich = r.container.querySelector('[data-profile="rich"]') as HTMLElement;
    expect(rich.textContent).toMatch(/Active/);
  });

  it('Advanced + Revert appear only when profile is deep', async () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'deep');
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => expect(r.container.querySelector('[role="dialog"]')).toBeTruthy());
    fireEvent.click(r.getByText(/Show advanced/));
    await waitFor(() => {
      expect(r.getByText(/Revert to Basic/)).toBeTruthy();
    });
  });

  it('backend status line reads CPU when no GPU adapter', async () => {
    setSettingsModalOpen(true);
    const r = render(() => <SettingsModal />);
    await waitFor(() => {
      expect(r.container.textContent).toMatch(/Acceleration: CPU/);
    });
  });

  it('openSettingsModal("hotkeys") lands on the Hotkeys tab', async () => {
    openSettingsModal('hotkeys');
    const r = render(() => <SettingsModal />);
    await waitFor(() => {
      // Hotkey binding rows expose the combo text; look for any monospace
      // binding button ("press key…" placeholder or an actual combo).
      expect(r.container.querySelector('.font-mono')).toBeTruthy();
    });
  });

  it('openSettingsModal("language") shows the language choices', async () => {
    openSettingsModal('language');
    const r = render(() => <SettingsModal />);
    await waitFor(() => {
      expect(r.container.querySelector('[data-testid="language-choices"]')).toBeTruthy();
    });
  });

  it('clicking a language button switches active language', async () => {
    const originalLang = lang();
    try {
      openSettingsModal('language');
      const r = render(() => <SettingsModal />);
      await waitFor(() =>
        expect(r.container.querySelector('[data-testid="language-choices"]')).toBeTruthy(),
      );
      const target = originalLang === 'hu' ? 'en' : 'hu';
      const btn = r.container.querySelector(`[data-lang="${target}"]`) as HTMLElement;
      fireEvent.click(btn);
      expect(lang()).toBe(target);
    } finally {
      setLang(originalLang);
    }
  });
});
