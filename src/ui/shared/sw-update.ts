/**
 * Service-worker update prompt.
 *
 * The PWA caches the app shell, so a tab opened before a deploy keeps
 * running the old bundle indefinitely. This module surfaces a sticky
 * info-toast when a new SW is waiting and only activates it on the
 * user's explicit click — auto-skip-waiting throws away in-flight
 * keystrokes that haven't hit the persistence pulse yet.
 *
 * Wired through `virtual:pwa-register` so vite-plugin-pwa's prompt-mode
 * registration drives the events. Dev/SSR paths are no-ops.
 */

import { toast } from './toast';
import { t } from '@/i18n';

let installed = false;

export function installSwUpdatePrompt(): void {
  if (installed) return;
  installed = true;

  // SW only registers in production builds. The virtual module exists in
  // both dev and prod, but in dev `registerSW` is a no-op stub.
  // Dynamic import keeps the dev path clean and lets us swallow any
  // unexpected breakage without taking down the whole boot.
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          // Sticky toast — no auto-dismiss. Reload only on explicit click.
          // `keepOpen: true` lets the UI stay rendered while the page
          // begins reloading (avoids a brief flash of the toast disappearing
          // before navigation happens).
          toast.withAction(
            t('swUpdate.message'),
            {
              label: t('swUpdate.reload'),
              handler: () => {
                // updateSW(true) sends skipWaiting to the SW and then
                // calls window.location.reload() once the new SW takes
                // control. That sequencing matters: reloading before
                // skipWaiting just re-loads the old controller.
                void updateSW(true);
              },
              keepOpen: true,
            },
          );
        },
        // No onOfflineReady toast — we already advertise offline-first
        // posture loudly; pinging the user about it on first install is
        // noise. The PWA install prompt itself covers the "now installed"
        // moment.
      });
    })
    .catch(() => {
      // Dev mode (no SW) or transient module-load failure. Either way
      // there's nothing to prompt about; bail silently.
    });
}
