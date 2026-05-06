import { createSignal } from 'solid-js';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const [available, setAvailable] = createSignal(false);
let captured: BeforeInstallPromptEvent | null = null;
let installed = false;

/**
 * Register `beforeinstallprompt` and `appinstalled` listeners. Idempotent;
 * subsequent calls are no-ops. Call once at boot.
 *
 * The prompt event is captured and stored. `installPromptAvailable()`
 * goes true only when:
 *   - we have a captured event AND
 *   - we are NOT already running standalone AND
 *   - `appinstalled` has not fired this session.
 *
 * Once `triggerInstall()` consumes the captured event, it is cleared
 * and the signal flips back to false — `beforeinstallprompt` is one-shot
 * per spec; the browser may fire a fresh one on a future visit.
 */
export function installPwaInstallCapture(): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    captured = e as BeforeInstallPromptEvent;
    setAvailable(computeAvailable());
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    setAvailable(false);
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

function computeAvailable(): boolean {
  return captured !== null && !isStandalone();
}

export const installPromptAvailable = available;

/**
 * Show the native install prompt. Returns the user's choice, or
 * 'unavailable' if no prompt was captured (Firefox, iOS Safari, already
 * installed). Safe to call without checking `installPromptAvailable()`
 * first.
 */
export async function triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = captured;
  if (!event) return 'unavailable';
  await event.prompt();
  const choice = await event.userChoice;
  captured = null;
  setAvailable(false);
  return choice.outcome;
}
