import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';

const mocks = vi.hoisted(() => ({
  triggerInstallMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  installPromptAvailableMock: vi.fn(() => false),
}));

vi.mock('./pwa-install', () => ({
  installPromptAvailable: () => mocks.installPromptAvailableMock(),
  triggerInstall: mocks.triggerInstallMock,
}));
vi.mock('./toast', () => ({
  toast: { success: mocks.toastSuccessMock },
}));
vi.mock('@/i18n', () => ({
  t: (key: string) => key,
}));

import { InstallButton } from './InstallButton';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.installPromptAvailableMock.mockReturnValue(false);
  cleanup();
});

describe('InstallButton', () => {
  it('renders nothing when prompt is not available', () => {
    mocks.installPromptAvailableMock.mockReturnValue(false);
    const { container } = render(() => <InstallButton />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a button when prompt is available', () => {
    mocks.installPromptAvailableMock.mockReturnValue(true);
    const { container } = render(() => <InstallButton />);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('calls triggerInstall and toasts on accepted', async () => {
    mocks.installPromptAvailableMock.mockReturnValue(true);
    mocks.triggerInstallMock.mockResolvedValue('accepted');
    const { getByRole } = render(() => <InstallButton />);
    fireEvent.click(getByRole('button'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.triggerInstallMock).toHaveBeenCalled();
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('pwa.installed');
  });

  it('does not toast on dismissed', async () => {
    mocks.installPromptAvailableMock.mockReturnValue(true);
    mocks.triggerInstallMock.mockResolvedValue('dismissed');
    const { getByRole } = render(() => <InstallButton />);
    fireEvent.click(getByRole('button'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.toastSuccessMock).not.toHaveBeenCalled();
  });
});
