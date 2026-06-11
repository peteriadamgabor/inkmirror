// Echoes scan worker. The analysis is a single O(words) pass, but a
// full-novel scope on a long manuscript is exactly the kind of work
// rule 3 keeps off the main thread.

import { analyzeEchoes, type EchoInputBlock, type EchoReport } from '@/engine/echoes';

export interface EchoesRequest {
  type: 'scan';
  /** Monotonic id so a stale reply can't overwrite a newer scan. */
  scanId: number;
  blocks: EchoInputBlock[];
  excludeTerms: string[];
}

export interface EchoesReply {
  type: 'result';
  scanId: number;
  report: EchoReport;
}

self.addEventListener('message', (e: MessageEvent<EchoesRequest>) => {
  const msg = e.data;
  if (msg?.type !== 'scan') return;
  const report = analyzeEchoes(msg.blocks, msg.excludeTerms);
  const reply: EchoesReply = { type: 'result', scanId: msg.scanId, report };
  (self as unknown as Worker).postMessage(reply);
});
