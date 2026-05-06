import { describe, it, expect, beforeEach, vi } from 'vitest';

let module: typeof import('./pwa-install');

interface MockPromptEvent {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): MockPromptEvent {
  const event: MockPromptEvent & Event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  window.dispatchEvent(event);
  return event as unknown as MockPromptEvent;
}

beforeEach(async () => {
  vi.resetModules();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
  module = await import('./pwa-install');
  module.installPwaInstallCapture();
});

describe('pwa-install', () => {
  it('starts with installPromptAvailable() === false', () => {
    expect(module.installPromptAvailable()).toBe(false);
  });

  it('flips to true on beforeinstallprompt', () => {
    fireBeforeInstallPrompt();
    expect(module.installPromptAvailable()).toBe(true);
  });

  it('flips to false on appinstalled', () => {
    fireBeforeInstallPrompt();
    expect(module.installPromptAvailable()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(module.installPromptAvailable()).toBe(false);
  });

  it('returns "unavailable" from triggerInstall when no event captured', async () => {
    const result = await module.triggerInstall();
    expect(result).toBe('unavailable');
  });

  it('triggerInstall calls prompt() and returns userChoice outcome', async () => {
    const event = fireBeforeInstallPrompt('accepted');
    const result = await module.triggerInstall();
    expect(event.prompt).toHaveBeenCalled();
    expect(result).toBe('accepted');
    expect(module.installPromptAvailable()).toBe(false);
  });

  it('reports prompt unavailable when running in standalone display-mode', async () => {
    vi.resetModules();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (q: string) => ({
        matches: q.includes('standalone'),
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
    const m = await import('./pwa-install');
    m.installPwaInstallCapture();
    fireBeforeInstallPrompt();
    expect(m.installPromptAvailable()).toBe(false);
  });
});
