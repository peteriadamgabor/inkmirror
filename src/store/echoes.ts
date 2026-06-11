/**
 * Echoes scan bridge: gathers block text from the document store, runs
 * the analysis in a worker (inline fallback where Workers don't exist —
 * jsdom tests), and holds the latest report as signals for the panel.
 * Results are derived from text and ephemeral by design — nothing is
 * persisted.
 */

import { createSignal } from 'solid-js';
import { store } from './document';
import type { EchoInputBlock, EchoReport } from '@/engine/echoes';
import type { EchoesReply, EchoesRequest } from '@/workers/echoes-worker';

export type EchoScope = 'chapter' | 'document';

const [echoReport, setEchoReport] = createSignal<EchoReport | null>(null);
const [echoScanning, setEchoScanning] = createSignal(false);
const [echoScope, setEchoScopeSignal] = createSignal<EchoScope>('chapter');

export { echoReport, echoScanning, echoScope };

export function setEchoScope(scope: EchoScope): void {
  setEchoScopeSignal(scope);
  // A report from the other scope would mislabel itself — drop it.
  setEchoReport(null);
}

let worker: Worker | null = null;
let workerFailed = false;
let scanCounter = 0;

function ensureWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  if (typeof Worker === 'undefined') {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('../workers/echoes-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (e: MessageEvent<EchoesReply>) => {
      const msg = e.data;
      if (msg?.type !== 'result' || msg.scanId !== scanCounter) return;
      setEchoReport(msg.report);
      setEchoScanning(false);
    });
    worker.addEventListener('error', () => {
      // Worker died (CSP, bundling) — fall back to inline for the rest
      // of the session; the in-flight scan is rerun by the caller's
      // fallback path, so just unstick the flag.
      workerFailed = true;
      worker = null;
      setEchoScanning(false);
    });
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

function collectBlocks(scope: EchoScope): EchoInputBlock[] {
  const chapterId = store.activeChapterId;
  const out: EchoInputBlock[] = [];
  for (const id of store.blockOrder) {
    const b = store.blocks[id];
    if (!b || b.deleted_at !== null) continue;
    if (b.type !== 'text' && b.type !== 'dialogue') continue;
    if (scope === 'chapter' && b.chapter_id !== chapterId) continue;
    if (b.content.trim().length === 0) continue;
    out.push({ id: b.id, text: b.content });
  }
  return out;
}

function collectExcludeTerms(): string[] {
  const terms: string[] = [];
  for (const c of store.characters) {
    if (c.name.trim()) terms.push(c.name.trim());
    for (const alias of c.aliases) {
      if (alias.trim()) terms.push(alias.trim());
    }
  }
  return terms;
}

export async function runEchoScan(): Promise<void> {
  if (echoScanning()) return;
  const blocks = collectBlocks(echoScope());
  const excludeTerms = collectExcludeTerms();
  scanCounter += 1;
  setEchoScanning(true);

  const w = ensureWorker();
  if (w) {
    const req: EchoesRequest = {
      type: 'scan',
      scanId: scanCounter,
      blocks,
      excludeTerms,
    };
    w.postMessage(req);
    return;
  }

  // Inline fallback — test environments and browsers where the worker
  // failed to spin up. The dynamic import keeps the analysis (and its
  // stopword tables) out of the main bundle on the worker path.
  try {
    const { analyzeEchoes } = await import('@/engine/echoes');
    setEchoReport(analyzeEchoes(blocks, excludeTerms));
  } finally {
    setEchoScanning(false);
  }
}

/** Stale results from another document would mislead — call on switch. */
export function clearEchoReport(): void {
  setEchoReport(null);
}
