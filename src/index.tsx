/* @refresh reload */
import { render } from 'solid-js/web';
import { createSignal, Match, Switch } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import { LandingRoute } from '@/routes/landing';
import { RoadmapRoute } from '@/routes/roadmap';
import { NotFoundRoute } from '@/routes/not-found';
import { DevAiPocRoute } from '@/routes/dev-ai-poc';
import { hasVisited, markVisited } from '@/ui/shared/first-visit';
import { getDb } from '@/db/connection';
import * as repo from '@/db/repository';
import { hydrateFromLoaded, flushPendingWrites } from '@/store/document';
import { clearUndoStack } from '@/store/undo';
import { scheduleAiPreload } from '@/ai';
import { installGlobalHotkeys } from '@/ui/shared/globalHotkeys';
import { BootSplash } from '@/ui/layout/BootSplash';
import { DocumentPicker } from '@/ui/layout/DocumentPicker';
import { CrashBoundary } from '@/ui/shared/CrashBoundary';
import { setReturnToPicker } from '@/store/ui-state';
import { ConfirmHost } from '@/ui/shared/ConfirmHost';
import { ToastHost } from '@/ui/shared/ToastHost';
import { FeedbackHost } from '@/ui/shared/FeedbackHost';
import { daysSinceLastExport } from '@/exporters';
import { toast } from '@/ui/shared/toast';
import type { UUID } from '@/types';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

type AppState =
  | { kind: 'loading' }
  | { kind: 'picker' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

const [appState, setAppState] = createSignal<AppState>({ kind: 'loading' });
let hotkeysInstalled = false;

async function initDb(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  await getDb();
}

async function openDocument(docId: UUID): Promise<void> {
  try {
    await flushPendingWrites(100);
    const loaded = await repo.loadDocument(docId);
    if (!loaded) {
      setAppState({ kind: 'error', message: 'Document not found.' });
      return;
    }
    hydrateFromLoaded(loaded);
    clearUndoStack();
    setAppState({ kind: 'ready' });
    scheduleAiPreload();
    if (!hotkeysInstalled) {
      installGlobalHotkeys();
      hotkeysInstalled = true;
    }
    // Nudge the user if they haven't exported in a while.
    const days = daysSinceLastExport();
    if (days === null) {
      // Never exported — show a gentler first-time hint after 3 days.
      setTimeout(() => {
        toast.info('Tip: export your work regularly. Everything lives in this browser only.');
      }, 5000);
    } else if (days >= 7) {
      setTimeout(() => {
        toast.info(
          `You haven't exported in ${days} days. Consider downloading a backup (Sidebar → Export).`,
        );
      }, 3000);
    }
  } catch (err) {
    setAppState({
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Register the picker navigation callback so the Sidebar can call
// it without importing index.tsx (which would be circular).
setReturnToPicker(() => {
  void flushPendingWrites(100).then(() => {
    setAppState({ kind: 'picker' });
  });
});

// Known top-level paths. Anything else renders 404 *without booting*
// the DB — we don't want a bogus URL to trigger IDB init, AI preload,
// hotkey install, etc.
const KNOWN_PATHS = new Set<string>(['/', '/perf', '/landing', '/roadmap', '/dev/ai-poc']);
const currentPath = window.location.pathname;
const isLanding = currentPath === '/landing';
const isRoadmap = currentPath === '/roadmap';
const isDevAiPoc = currentPath === '/dev/ai-poc';
const isKnownPath = KNOWN_PATHS.has(currentPath);

// First-visit redirect: sync, runs BEFORE render so a brand-new visitor
// never even flashes the boot splash — they land on /landing first.
// Only redirects from `/` (the editor entry); /roadmap, /landing, /perf
// are self-contained and always reachable directly.
if (currentPath === '/' && !hasVisited()) {
  window.location.replace('/landing');
} else if (currentPath === '/') {
  // Ensure the marker is set for returning visitors who entered via
  // a bookmark or direct link — once they've loaded the app, they've
  // "visited" for the purpose of future landing redirects.
  markVisited();
}

render(
  () =>
    !isKnownPath ? (
      <NotFoundRoute />
    ) : isLanding ? (
      <LandingRoute />
    ) : isRoadmap ? (
      <RoadmapRoute />
    ) : isDevAiPoc ? (
      <DevAiPocRoute />
    ) : (
    <CrashBoundary>
      <Switch>
        <Match when={appState().kind === 'loading'}>
          <BootSplash />
        </Match>
        <Match when={appState().kind === 'error'}>
          <BootSplash error={(appState() as { kind: 'error'; message: string }).message} />
        </Match>
        <Match when={appState().kind === 'picker'}>
          <DocumentPicker onSelect={(id) => void openDocument(id)} />
          <ConfirmHost />
          <FeedbackHost />
          <ToastHost />
        </Match>
        <Match when={appState().kind === 'ready'}>
          <Router>
            <Route path="/" component={EditorRoute} />
            <Route path="/perf" component={PerfHarnessRoute} />
            <Route path="/landing" component={LandingRoute} />
            <Route path="/roadmap" component={RoadmapRoute} />
            {/* Belt-and-suspenders: unknown paths that somehow reach
                the Router (client-side nav to a bad URL) still resolve. */}
            <Route path="*" component={NotFoundRoute} />
          </Router>
        </Match>
      </Switch>
    </CrashBoundary>
    ),
  rootEl,
);

// Boot: init IDB then show the picker. If exactly one document exists
// and the user hasn't explicitly returned to the picker, auto-open it
// for a seamless single-document experience.
// Skipped on the landing/roadmap pages and on unknown paths — no point
// opening the DB for a URL that will never touch it.
if (isKnownPath && !isLanding && !isRoadmap && !isDevAiPoc) {
  void initDb()
    .then(async () => {
      const docs = await repo.listDocuments();
      if (docs.length === 1) {
        await openDocument(docs[0].id);
      } else {
        setAppState({ kind: 'picker' });
      }
    })
    .catch((err) => {
      setAppState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });

  window.addEventListener('beforeunload', () => {
    void flushPendingWrites(200);
  });
}
