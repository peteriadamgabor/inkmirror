/* @refresh reload */
import { render } from 'solid-js/web';
import { createSignal, Match, Switch } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import { getDb } from '@/db/connection';
import * as repo from '@/db/repository';
import { hydrateFromLoaded, flushPendingWrites } from '@/store/document';
import { clearUndoStack } from '@/store/undo';
import { scheduleAiPreload } from '@/ai';
import { installGlobalHotkeys } from '@/ui/shared/globalHotkeys';
import { BootSplash } from '@/ui/layout/BootSplash';
import { DocumentPicker } from '@/ui/layout/DocumentPicker';
import { setReturnToPicker } from '@/store/ui-state';
import { ConfirmHost } from '@/ui/shared/ConfirmHost';
import { ToastHost } from '@/ui/shared/ToastHost';
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

render(
  () => (
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
        <ToastHost />
      </Match>
      <Match when={appState().kind === 'ready'}>
        <Router>
          <Route path="/" component={EditorRoute} />
          <Route path="/perf" component={PerfHarnessRoute} />
        </Router>
      </Match>
    </Switch>
  ),
  rootEl,
);

// Boot: init IDB then show the picker. If exactly one document exists
// and the user hasn't explicitly returned to the picker, auto-open it
// for a seamless single-document experience.
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
