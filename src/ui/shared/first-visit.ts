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
const BOUNCE_KEY = 'inkmirror.landingBounce';

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

/**
 * Loop guard for the first-visit redirect. If `/` already bounced the
 * visitor to /landing once this session and they're back on `/` still
 * unmarked, something upstream is redirecting /landing away (it
 * happened: a Worker bug 307'd every SPA route back to `/`). In that
 * case skip the redirect and let the app boot rather than flash-loop.
 * sessionStorage so the guard resets when the tab closes.
 */
export function landingRedirectBounced(): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  try {
    return sessionStorage.getItem(BOUNCE_KEY) === '1';
  } catch {
    return true; // can't track the bounce → never risk a loop
  }
}

export function markLandingRedirect(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(BOUNCE_KEY, '1');
  } catch {
    // Ignore — landingRedirectBounced() returns true on broken storage,
    // so the redirect simply won't be attempted again.
  }
}
