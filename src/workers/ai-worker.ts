/// <reference lib="webworker" />
import { pipeline, env, type TextClassificationPipeline } from '@huggingface/transformers';

// Allow remote model downloads from HF; disable local model lookup.
env.allowLocalModels = false;
env.allowRemoteModels = true;

const MODEL_ID = 'onnx-community/language_detection-ONNX';
const TASK = 'text-classification';

export interface AiRequestPreload {
  id: string;
  kind: 'preload';
}

export interface AiRequestDetectLanguage {
  id: string;
  kind: 'detect-language';
  text: string;
}

export type AiRequest = AiRequestPreload | AiRequestDetectLanguage;

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
}

export interface AiResponseProgress {
  kind: 'progress';
  phase: string;
  percent: number | null;
}

export type AiResponse = AiResponseOk | AiResponseErr | AiResponseReady | AiResponseProgress;

let classifierPromise: Promise<TextClassificationPipeline> | null = null;

function post(msg: AiResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

async function getClassifier(): Promise<TextClassificationPipeline> {
  if (classifierPromise) return classifierPromise;
  classifierPromise = (async () => {
    const pipe = (await pipeline(TASK, MODEL_ID, {
      progress_callback: (progress: unknown) => {
        // Transformers.js emits { status, file, progress, loaded, total }
        const p = progress as { status?: string; progress?: number };
        post({
          kind: 'progress',
          phase: p.status ?? 'unknown',
          percent: typeof p.progress === 'number' ? p.progress : null,
        });
      },
    })) as TextClassificationPipeline;
    post({ kind: 'ready' });
    return pipe;
  })();
  return classifierPromise;
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener('message', async (event: MessageEvent<AiRequest>) => {
  const req = event.data;
  try {
    if (req.kind === 'preload') {
      await getClassifier();
      post({ id: req.id, ok: true, result: null });
      return;
    }
    if (req.kind === 'detect-language') {
      const classifier = await getClassifier();
      const output = await classifier(req.text);
      // transformers.js returns an array of {label, score}
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
});
