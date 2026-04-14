/* @refresh reload */
import { render } from 'solid-js/web';
import { createSignal, Match, Switch } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import { getDb } from '@/db/connection';
import * as repo from '@/db/repository';
import { hydrateFromLoaded, flushPendingWrites } from '@/store/document';
import { scheduleAiPreload } from '@/ai';
import { BootSplash } from '@/ui/layout/BootSplash';
import type { Document, Chapter, Block, UUID } from '@/types';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

function emptyStarter(): { doc: Document; chapter: Chapter; block: Block } {
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  return {
    doc: {
      id: docId,
      title: 'Untitled',
      author: '',
      synopsis: '',
      settings: {
        font_family: 'Georgia, serif',
        font_size: 16,
        line_height: 1.8,
        editor_width: 680,
        theme: 'light',
      },
      created_at: now,
      updated_at: now,
    },
    chapter: {
      id: chapterId,
      document_id: docId,
      title: 'Chapter 1',
      order: 0,
      created_at: now,
      updated_at: now,
    },
    block: {
      id: blockId,
      chapter_id: chapterId,
      type: 'text',
      content: '',
      order: 0,
      metadata: { type: 'text' },
      deleted_at: null,
      deleted_from: null,
      created_at: now,
      updated_at: now,
    },
  };
}

type BootResult = { ok: true } | { ok: false; error: string };

async function boot(): Promise<BootResult> {
  try {
    await getDb();
    const existing = await repo.listDocuments();
    let docId: UUID;
    if (existing.length === 0) {
      const seed = emptyStarter();
      await repo.saveDocument(seed.doc);
      await repo.saveChapter(seed.chapter);
      await repo.saveBlock(seed.block, seed.doc.id);
      docId = seed.doc.id;
    } else {
      docId = existing[0].id;
    }
    const loaded = await repo.loadDocument(docId);
    if (!loaded) return { ok: false, error: 'Document row missing after seed.' };
    hydrateFromLoaded(loaded);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type BootState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

const [bootState, setBootState] = createSignal<BootState>({ kind: 'loading' });

render(
  () => (
    <Switch>
      <Match when={bootState().kind === 'loading'}>
        <BootSplash />
      </Match>
      <Match when={bootState().kind === 'error'}>
        <BootSplash error={(bootState() as { kind: 'error'; message: string }).message} />
      </Match>
      <Match when={bootState().kind === 'ready'}>
        <Router>
          <Route path="/" component={EditorRoute} />
          <Route path="/perf" component={PerfHarnessRoute} />
        </Router>
      </Match>
    </Switch>
  ),
  rootEl,
);

void boot().then((result) => {
  if (result.ok) {
    setBootState({ kind: 'ready' });
    scheduleAiPreload();
  } else {
    setBootState({ kind: 'error', message: result.error });
  }
});

window.addEventListener('beforeunload', () => {
  void flushPendingWrites(200);
});
