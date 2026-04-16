/// <reference lib="webworker" />
import { pipeline, env, type TextClassificationPipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;

// Route all HuggingFace model fetches through our Cloudflare Worker
// proxy so the browser gets the CORS headers HuggingFace's CDN omits
// for some cross-origin requests. In development (localhost) and any
// deploy where the origin already has CORS working, this is a no-op
// routing tweak — our worker.ts just forwards to huggingface.co.
// The path pattern matches Transformers.js's default remoteURL layout
// ({host}/{owner}/{model}/resolve/{revision}/{file}).
if (typeof self !== 'undefined' && self.location?.origin) {
  env.remoteHost = `${self.location.origin}/hf-proxy`;
  env.remotePathTemplate = '{model}/resolve/{revision}';
}

// ---------- model configuration ----------

interface ModelConfig {
  id: string;
  task: 'text-classification';
}

const MODELS: Record<'sentiment', ModelConfig> = {
  sentiment: {
    id: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    task: 'text-classification',
  },
};

// ---------- message protocol ----------

export interface AiRequestPreload {
  id: string;
  kind: 'preload';
}

export interface AiRequestDetectSentiment {
  id: string;
  kind: 'detect-sentiment';
  text: string;
}

export type AiRequest = AiRequestPreload | AiRequestDetectSentiment;

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

const pipelinePromises = new Map<keyof typeof MODELS, Promise<TextClassificationPipeline>>();

function post(msg: AiResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

async function getPipeline(key: keyof typeof MODELS): Promise<TextClassificationPipeline> {
  const cached = pipelinePromises.get(key);
  if (cached) return cached;
  const cfg = MODELS[key];
  const promise = (async () => {
    const pipe = (await pipeline(cfg.task, cfg.id, {
      progress_callback: (progress: unknown) => {
        const p = progress as { status?: string; progress?: number };
        post({
          kind: 'progress',
          phase: p.status ?? 'unknown',
          percent: typeof p.progress === 'number' ? p.progress : null,
        });
      },
    })) as TextClassificationPipeline;
    post({ kind: 'ready', model: key });
    return pipe;
  })();
  pipelinePromises.set(key, promise);
  return promise;
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  'message',
  async (event: MessageEvent<AiRequest>) => {
    const req = event.data;
    try {
      if (req.kind === 'preload') {
        await getPipeline('sentiment');
        post({ id: req.id, ok: true, result: null });
        return;
      }
      if (req.kind === 'detect-sentiment') {
        const classifier = await getPipeline('sentiment');
        const output = await classifier(req.text);
        post({ id: req.id, ok: true, result: output });
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
