/// <reference lib="webworker" />
import {
  pipeline,
  env,
  type TextClassificationPipeline,
  type ZeroShotClassificationPipeline,
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;

// On the deployed origin, route HuggingFace fetches through our
// Cloudflare Worker proxy so the browser gets the CORS headers
// HuggingFace's CDN omits for the workers.dev domain. In dev
// (localhost), talk to HuggingFace directly — the proxy path adds
// nothing and can mask its own bugs under Vite's SPA fallback.
if (typeof self !== 'undefined' && self.location?.origin) {
  const host = self.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (!isLocal) {
    env.remoteHost = `${self.location.origin}/hf-proxy`;
    env.remotePathTemplate = '{model}/resolve/{revision}';
  }
}

// ---------- model configuration ----------

const MODELS = {
  sentiment: {
    id: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    task: 'text-classification',
  },
  mdeberta: {
    id: 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7',
    task: 'zero-shot-classification',
  },
} as const;

type AiProfile = 'lightweight' | 'deep';
type AiBackend = 'webgpu' | 'wasm';
type ModelDtype = 'q4' | 'fp16' | 'fp32';

interface WorkerConfig {
  profile: AiProfile;
  backend: AiBackend;
  dtype: ModelDtype;
}

// Default config — used if `preload` is called before `configure`. Keeps
// existing lightweight-path behavior for any caller that predates Near tier.
const DEFAULT_CONFIG: WorkerConfig = {
  profile: 'lightweight',
  backend: 'wasm',
  dtype: 'q4',
};

let config: WorkerConfig = DEFAULT_CONFIG;

// ---------- message protocol ----------

export interface AiRequestConfigure {
  id: string;
  kind: 'configure';
  profile: AiProfile;
  backend: AiBackend;
  dtype: ModelDtype;
}

export interface AiRequestPreload {
  id: string;
  kind: 'preload';
}

export interface AiRequestDetectSentiment {
  id: string;
  kind: 'detect-sentiment';
  text: string;
}

export interface AiRequestClassifyMood {
  id: string;
  kind: 'classify-mood';
  text: string;
  labels: string[];
}

export interface AiRequestNliPair {
  id: string;
  kind: 'nli-pair';
  premise: string;
  hypothesis: string;
}

export type AiRequest =
  | AiRequestConfigure
  | AiRequestPreload
  | AiRequestDetectSentiment
  | AiRequestClassifyMood
  | AiRequestNliPair;

export interface AiResponseOk {
  id: string;
  ok: true;
  result: unknown;
}

export interface AiResponseErr {
  id: string;
  ok: false;
  error: string;
}

export interface AiResponseReady {
  kind: 'ready';
  model: string;
}

export interface AiResponseProgress {
  kind: 'progress';
  phase: string;
  percent: number | null;
}

export type AiResponse = AiResponseOk | AiResponseErr | AiResponseReady | AiResponseProgress;

// ---------- pipeline cache ----------

let sentimentPipeline: Promise<TextClassificationPipeline> | null = null;
let moodPipeline: Promise<ZeroShotClassificationPipeline> | null = null;

function post(msg: AiResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

function progressReporter(modelKey: string) {
  return (progress: unknown) => {
    const p = progress as { status?: string; progress?: number; file?: string };
    const phase = p.status ? `${modelKey}:${p.status}${p.file ? `:${p.file}` : ''}` : modelKey;
    post({
      kind: 'progress',
      phase,
      percent: typeof p.progress === 'number' ? p.progress : null,
    });
  };
}

async function loadSentiment(): Promise<TextClassificationPipeline> {
  if (sentimentPipeline) return sentimentPipeline;
  sentimentPipeline = (async () => {
    const pipe = (await pipeline(MODELS.sentiment.task, MODELS.sentiment.id, {
      progress_callback: progressReporter('sentiment'),
    })) as TextClassificationPipeline;
    post({ kind: 'ready', model: 'sentiment' });
    return pipe;
  })();
  return sentimentPipeline;
}

async function loadMood(): Promise<ZeroShotClassificationPipeline> {
  if (moodPipeline) return moodPipeline;
  moodPipeline = (async () => {
    try {
      const pipe = (await pipeline(MODELS.mdeberta.task, MODELS.mdeberta.id, {
        device: config.backend,
        dtype: config.dtype,
        progress_callback: progressReporter('mood'),
      })) as ZeroShotClassificationPipeline;
      post({ kind: 'ready', model: 'mood' });
      return pipe;
    } catch (err) {
      // If we asked for WebGPU but the adapter silently disappeared mid-
      // session, fall back to wasm in-place. Clears the cached promise so
      // the next call will try again with updated config.
      const msg = err instanceof Error ? err.message : String(err);
      if (config.backend === 'webgpu' && /webgpu|gpu adapter|no available backend/i.test(msg)) {
        config = { ...config, backend: 'wasm' };
        moodPipeline = null;
        const pipe = (await pipeline(MODELS.mdeberta.task, MODELS.mdeberta.id, {
          device: 'wasm',
          dtype: config.dtype,
          progress_callback: progressReporter('mood'),
        })) as ZeroShotClassificationPipeline;
        post({ kind: 'ready', model: 'mood' });
        return pipe;
      }
      throw err;
    }
  })();
  return moodPipeline;
}

async function preloadActive(): Promise<void> {
  if (config.profile === 'deep') {
    await loadMood();
  } else {
    await loadSentiment();
  }
}

// ---------- message handler ----------

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  'message',
  async (event: MessageEvent<AiRequest>) => {
    const req = event.data;
    try {
      if (req.kind === 'configure') {
        config = { profile: req.profile, backend: req.backend, dtype: req.dtype };
        post({ id: req.id, ok: true, result: null });
        return;
      }

      if (req.kind === 'preload') {
        await preloadActive();
        post({ id: req.id, ok: true, result: null });
        return;
      }

      if (req.kind === 'detect-sentiment') {
        // Sentiment requests always run against the distilbert pipeline —
        // this stays on the lightweight path even if the worker was
        // configured for deep. Used for backwards compatibility.
        const classifier = await loadSentiment();
        const output = await classifier(req.text);
        post({ id: req.id, ok: true, result: output });
        return;
      }

      if (req.kind === 'classify-mood') {
        const classifier = await loadMood();
        const output = (await classifier(req.text, req.labels, { multi_label: false })) as {
          labels: string[];
          scores: number[];
        };
        const pairs = output.labels.map((label, i) => ({ label, score: output.scores[i] }));
        post({ id: req.id, ok: true, result: pairs });
        return;
      }

      if (req.kind === 'nli-pair') {
        // NLI via zero-shot pipeline: candidate_labels=[hypothesis] with a
        // bare template ('{}') bypasses the default "This example is {}"
        // wrapping, so the model sees premise/hypothesis as a direct NLI
        // pair. With `multi_label: true` and a single candidate, the
        // pipeline applies a binary softmax over the model's entail and
        // contradict logits (neutral logit is dropped). scores[0] is
        // therefore P(entail | not neutral); P(contradict | not neutral)
        // = 1 - scores[0]. This conditional read is what we want for
        // contradiction detection — neutral pairs naturally land near
        // 0.5 and won't cross the inconsistency threshold.
        const classifier = await loadMood();
        const output = (await classifier(req.premise, [req.hypothesis], {
          multi_label: true,
          hypothesis_template: '{}',
        })) as { labels: string[]; scores: number[] };
        const entailment = output.scores[0] ?? 0;
        post({
          id: req.id,
          ok: true,
          result: {
            entailment,
            contradiction: 1 - entailment,
          },
        });
        return;
      }
    } catch (err) {
      post({
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
