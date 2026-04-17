/**
 * First-visit detection.
 *
 * On a cold load of `/`, if this marker is absent we redirect the
 * visitor to `/landing` so they see the pitch before the app opens.
 * The marker is set when they click any "enter the app" CTA, and
 * also automatically the first time the editor/picker actually mounts
 * — so a bookmarked `/?doc=xxx` link skips landing forever after.
 *
 * localStorage by design (not IDB): it's synchronous, survives page
 * reloads, and stays out of the boot path so cold navigation to the
 * editor isn't blocked by an async DB open.
 */

const STORAGE_KEY = 'inkmirror.hasVisited';

export function hasVisited(): boolean {
  if (typeof localStorage === 'undefined') return true; // SSR / non-browser: don't redirect
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode in some browsers throws on read. Treat as "visited"
    // to avoid an infinite landing → / → landing loop.
    return true;
  }
}

export function markVisited(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode / quota errors are silent — worst case the user
    // sees landing one extra time. Not worth surfacing.
  }
}
