/**
 * Throwaway WebGPU + mDeBERTa PoC — validates the Near tier model and
 * backend before we build the rest of the feature. Not linked from the
 * app; reach it via /dev/ai-poc in dev only.
 *
 * Delete after Near tier ships.
 */
import { createSignal, For, Show } from 'solid-js';

type BackendName = 'webgpu' | 'wasm';

type PhaseLog = {
  label: string;
  ms?: number;
  detail?: string;
  ok: boolean;
};

const MODEL_ID = 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';

const MOOD_LABELS = [
  'tender', 'tension', 'dread', 'longing', 'grief',
  'hope', 'joy', 'wonder', 'rage', 'calm',
] as const;

const SAMPLE_PROSE =
  'Yakov sat on the rotten threshold, his fiddle silent beside him, ' +
  'and thought of the willow by the river — how it had stood green in ' +
  'his grandfather\'s time, and how it would still be standing when he ' +
  'was gone.';

const NLI_PREMISE = "Ivan's brother Pyotr was a fiddler in the village.";
const NLI_HYPOTHESIS = "Pyotr, Ivan's cousin, came home drunk.";

export function DevAiPocRoute() {
  const [backend, setBackend] = createSignal<BackendName>(
    'gpu' in navigator ? 'webgpu' : 'wasm',
  );
  const [dtype, setDtype] = createSignal<'q4' | 'fp16' | 'fp32'>('q4');
  const [running, setRunning] = createSignal(false);
  const [log, setLog] = createSignal<PhaseLog[]>([]);

  function push(entry: PhaseLog) {
    setLog((prev) => [...prev, entry]);
  }

  async function run() {
    setRunning(true);
    setLog([]);

    const device = backend();
    push({
      label: `navigator.gpu present: ${String('gpu' in navigator)}`,
      ok: true,
      detail: `userAgent: ${navigator.userAgent.slice(0, 100)}`,
    });

    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.allowRemoteModels = true;

      // --- Zero-shot load ---
      let activeDevice: BackendName = device;
      const loadStart = performance.now();
      let zsl;
      try {
        zsl = await pipeline('zero-shot-classification', MODEL_ID, {
          device: activeDevice,
          dtype: dtype(),
          progress_callback: (p: unknown) => {
            const pp = p as { status?: string; progress?: number; file?: string };
            if (pp.status === 'progress' && typeof pp.progress === 'number') {
              // Live progress — replace last progress entry to avoid log spam.
              setLog((prev) => {
                const last = prev[prev.length - 1];
                const msg = {
                  label: `download: ${pp.file ?? '?'} ${pp.progress?.toFixed(0)}%`,
                  ok: true,
                };
                if (last && last.label.startsWith('download:')) {
                  return [...prev.slice(0, -1), msg];
                }
                return [...prev, msg];
              });
            } else if (pp.status) {
              push({ label: `phase: ${pp.status}${pp.file ? ` (${pp.file})` : ''}`, ok: true });
            }
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push({
          label: 'zero-shot pipeline load FAILED',
          ok: false,
          detail: msg,
        });
        const isGpuFailure = /webgpu|gpu adapter|no available backend/i.test(msg);
        if (device === 'webgpu' && isGpuFailure) {
          push({ label: 'WebGPU adapter unavailable — retrying with wasm', ok: true });
          setBackend('wasm');
          activeDevice = 'wasm';
          zsl = await pipeline('zero-shot-classification', MODEL_ID, {
            device: 'wasm',
            dtype: dtype(),
          });
        } else if (dtype() !== 'fp32') {
          push({ label: 'retrying with dtype=fp32', ok: true });
          setDtype('fp32');
          zsl = await pipeline('zero-shot-classification', MODEL_ID, {
            device: activeDevice,
            dtype: 'fp32',
          });
        } else {
          throw err;
        }
      }
      const loadMs = performance.now() - loadStart;
      push({ label: `zero-shot model loaded`, ms: Math.round(loadMs), ok: true });

      // --- Zero-shot inference ---
      const zsStart = performance.now();
      const zsResult = (await zsl(SAMPLE_PROSE, MOOD_LABELS as unknown as string[], {
        multi_label: false,
      })) as { labels: string[]; scores: number[] };
      const zsMs = performance.now() - zsStart;
      push({
        label: `zero-shot inference`,
        ms: Math.round(zsMs),
        ok: true,
        detail: `top: ${zsResult.labels[0]} (${zsResult.scores[0].toFixed(3)})`,
      });

      // --- NLI (reuse cached model via different task) ---
      const nliLoadStart = performance.now();
      const nli = await pipeline('zero-shot-classification', MODEL_ID, {
        device: activeDevice,
        dtype: dtype(),
      });
      const nliLoadMs = performance.now() - nliLoadStart;
      push({
        label: `NLI pipeline (reuse) loaded`,
        ms: Math.round(nliLoadMs),
        ok: true,
        detail: nliLoadMs < 200 ? 'cached, good' : 'not cached — check',
      });

      // NLI via zero-shot with two labels is the canonical transformers.js
      // pattern: the underlying model gets {premise, hypothesis} pairs and
      // returns contradiction/entailment as the two label scores.
      const nliStart = performance.now();
      const nliResult = (await nli(NLI_PREMISE, [NLI_HYPOTHESIS], {
        multi_label: true,
      })) as { labels: string[]; scores: number[] };
      const nliMs = performance.now() - nliStart;
      push({
        label: `NLI inference (single pair)`,
        ms: Math.round(nliMs),
        ok: true,
        detail: `entailment score: ${nliResult.scores[0].toFixed(3)}`,
      });

      // --- Batch of 10 NLI calls (realistic per-character workload) ---
      const batchStart = performance.now();
      const batch: Array<Promise<unknown>> = [];
      for (let i = 0; i < 10; i++) {
        batch.push(nli(NLI_PREMISE, [NLI_HYPOTHESIS], { multi_label: true }));
      }
      await Promise.all(batch);
      const batchMs = performance.now() - batchStart;
      push({
        label: `NLI x10 sequential-ish (Promise.all)`,
        ms: Math.round(batchMs),
        ok: true,
        detail: `avg ${Math.round(batchMs / 10)} ms/call`,
      });

      push({ label: '=== PoC complete ===', ok: true });
    } catch (err) {
      push({
        label: 'FATAL',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div class="min-h-screen bg-stone-100 dark:bg-stone-900 p-8 font-mono text-sm text-stone-900 dark:text-stone-100">
      <h1 class="text-2xl font-bold mb-4">Near tier — WebGPU + mDeBERTa PoC</h1>
      <p class="text-stone-600 dark:text-stone-400 mb-6">
        Throwaway. Measures model load + inference latency. Delete with Near tier ship.
      </p>

      <div class="mb-4 space-y-2">
        <div>
          <label class="mr-2">backend:</label>
          <select
            disabled={running()}
            value={backend()}
            onChange={(e) => setBackend(e.currentTarget.value as BackendName)}
            class="bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 px-2 py-1 rounded"
          >
            <option value="webgpu">webgpu</option>
            <option value="wasm">wasm (CPU)</option>
          </select>
          <span class="ml-3 text-stone-500">
            (navigator.gpu present: {String('gpu' in navigator)})
          </span>
        </div>
        <div>
          <label class="mr-2">dtype:</label>
          <select
            disabled={running()}
            value={dtype()}
            onChange={(e) => setDtype(e.currentTarget.value as 'q4' | 'fp16' | 'fp32')}
            class="bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 px-2 py-1 rounded"
          >
            <option value="q4">q4 (~80 MB)</option>
            <option value="fp16">fp16</option>
            <option value="fp32">fp32 (~280 MB)</option>
          </select>
        </div>
      </div>

      <button
        disabled={running()}
        onClick={run}
        class="bg-violet-500 hover:bg-violet-600 disabled:bg-stone-400 text-white px-4 py-2 rounded font-sans font-semibold"
      >
        {running() ? 'Running…' : 'Run PoC'}
      </button>

      <div class="mt-6 space-y-1">
        <For each={log()}>
          {(entry) => (
            <div class={entry.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}>
              {entry.ok ? '✓' : '✗'} {entry.label}
              {entry.ms !== undefined && <span class="ml-2 text-stone-500">[{entry.ms}ms]</span>}
              <Show when={entry.detail}>
                <div class="ml-6 text-stone-500 dark:text-stone-400 text-xs">{entry.detail}</div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
