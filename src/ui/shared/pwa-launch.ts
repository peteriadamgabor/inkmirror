import { importBridge } from '@/store/import-bridge';

interface FileSystemFileHandleLite {
  getFile(): Promise<File>;
}

interface LaunchParamsLite {
  files: FileSystemFileHandleLite[];
}

interface LaunchQueueLite {
  setConsumer(callback: (params: LaunchParamsLite) => void | Promise<void>): void;
}

/**
 * Consume the ?share=<uuid> query param if present. The browser SW
 * (src/sw.ts) stashes incoming share_target POSTs under that key in the
 * `inkmirror-share-inbox` cache; this function pulls the file back out,
 * hands it to importBridge, and cleans the URL.
 *
 * Safe to call in non-SW environments — gracefully no-ops when caches
 * is unavailable.
 */
export async function consumeShareTargetIfPresent(): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  const m = window.location.search.match(/[?&]share=([0-9a-f-]{8,})/);
  if (!m) return;
  const id = m[1];
  try {
    const cache = await caches.open('inkmirror-share-inbox');
    const res = await cache.match(`/__share/${id}`);
    if (!res) {
      window.history.replaceState(null, '', '/');
      return;
    }
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-share-name') || 'shared.json');
    const file = new File([blob], name, { type: blob.type || 'application/json' });
    await cache.delete(`/__share/${id}`);
    window.history.replaceState(null, '', '/');
    await importBridge(file);
  } catch {
    window.history.replaceState(null, '', '/');
  }
}

/**
 * Subscribe to the PWA `launchQueue` so double-clicking a `.inkmirror.json`
 * file in the OS file manager (Chromium desktop, Android Chrome) routes
 * the file into the running InkMirror window. Idempotent; safe to call
 * once at boot. No-op in browsers without the API (Firefox, Safari).
 */
export function installPwaLaunchHandler(): void {
  if (typeof window === 'undefined') return;
  const lq = (window as unknown as { launchQueue?: LaunchQueueLite }).launchQueue;
  if (!lq) return;
  lq.setConsumer(async (params) => {
    for (const handle of params.files ?? []) {
      try {
        const file = await handle.getFile();
        await importBridge(file, {});
      } catch {
        // Skip unreadable handles silently — there is no UI surface to
        // report into at boot time.
      }
    }
  });
}
