import { createSignal, type Accessor } from 'solid-js';
import type { AiBackend, AiProfile } from './profile';
import { logAiError } from './errors';

export interface LanguageResult {
  label: string;
  score: number;
}

export interface SentimentResult {
  label: string;
  score: number;
}

export interface MoodResult {
  label: string;
  score: number;
}

export interface NliPairResult {
  /** P(premise entails hypothesis), softmax over entailment vs contradiction. */
  entailment: number;
  /** 1 - entailment. Higher = stronger contradiction signal. */
  contradiction: number;
}

export interface ModelProgress {
  phase: string;
  percent: number | null;
}

export type ModelDtype = 'q4' | 'fp16' | 'fp32';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface AiClientHandle {
  isReady: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  loadError: Accessor<string | null>;
  modelProgress: Accessor<ModelProgress | null>;
  preload: () => Promise<void>;
  configure: (profile: AiProfile, backend: AiBackend, dtype: ModelDtype) => Promise<void>;
  detectLanguage: (text: string) => Promise<LanguageResult[]>;
  detectSentiment: (text: string) => Promise<SentimentResult[]>;
  classifyMood: (text: string, labels: readonly string[]) => Promise<MoodResult[]>;
  nliPair: (premise: string, hypothesis: string) => Promise<NliPairResult>;
}

const REQUEST_TIMEOUT_MS = 60_000;

export interface AiClientDeps {
  createWorker: () => Worker;
}

export function createAiClient(deps: AiClientDeps): AiClientHandle {
  const [isReady, setIsReady] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [modelProgress, setModelProgress] = createSignal<ModelProgress | null>(null);

  let worker: Worker | null = null;
  const pending = new Map<string, PendingRequest>();
  let nextId = 0;
  let preloadPromise: Promise<void> | null = null;

  function ensureWorker(): Worker {
    if (worker) return worker;
    try {
      worker = deps.createWorker();
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onWorkerError);
      return worker;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      logAiError('client.ensureWorker', err);
      throw err;
    }
  }

  function onMessage(event: MessageEvent<unknown>) {
    const msg = event.data as Record<string, unknown>;
    if (msg && msg.kind === 'ready') {
      setIsReady(true);
      setIsLoading(false);
      setModelProgress(null);
      return;
    }
    if (msg && msg.kind === 'progress') {
      const phase = typeof msg.phase === 'string' ? msg.phase : 'loading';
      const percent = typeof msg.percent === 'number' ? msg.percent : null;
      setModelProgress({ phase, percent });
      return;
    }
    const id = typeof msg?.id === 'string' ? msg.id : null;
    if (!id) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);
    if ((msg as { ok: unknown }).ok === true) {
      entry.resolve((msg as { result: unknown }).result);
    } else {
      const err = new Error(
        typeof (msg as { error?: unknown }).error === 'string'
          ? (msg as { error: string }).error
          : 'ai-worker error',
      );
      entry.reject(err);
    }
  }

  function onWorkerError(event: Event) {
    // Duck-type instead of `instanceof ErrorEvent` — jsdom and our test mock
    // don't implement the real ErrorEvent class.
    const maybe = event as unknown as { message?: unknown };
    const errorMessage =
      typeof maybe.message === 'string' && maybe.message
        ? maybe.message
        : 'ai-worker error';
    setLoadError(errorMessage);
    setIsLoading(false);
    logAiError('client.workerError', errorMessage);
    // Reject anything still pending
    for (const [, entry] of pending) {
      clearTimeout(entry.timeout);
      entry.reject(new Error(errorMessage));
    }
    pending.clear();
  }

  function send<T>(kind: string, extra: Record<string, unknown> = {}): Promise<T> {
    const w = ensureWorker();
    const id = `req-${++nextId}`;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`ai request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timeout,
      });
      w.postMessage({ id, kind, ...extra });
    });
  }

  async function preload(): Promise<void> {
    if (preloadPromise) return preloadPromise;
    setIsLoading(true);
    setLoadError(null);
    preloadPromise = (async () => {
      try {
        await send<null>('preload');
        // isReady is flipped by the 'ready' message, not here
      } catch (err) {
        setIsLoading(false);
        setLoadError(err instanceof Error ? err.message : String(err));
        logAiError('client.preload', err);
        throw err;
      }
    })();
    return preloadPromise;
  }

  async function detectLanguage(text: string): Promise<LanguageResult[]> {
    const result = await send<LanguageResult[] | LanguageResult>('detect-language', { text });
    return Array.isArray(result) ? result : [result];
  }

  async function detectSentiment(text: string): Promise<SentimentResult[]> {
    const result = await send<SentimentResult[] | SentimentResult>('detect-sentiment', { text });
    return Array.isArray(result) ? result : [result];
  }

  async function configure(
    profile: AiProfile,
    backend: AiBackend,
    dtype: ModelDtype,
  ): Promise<void> {
    await send<null>('configure', { profile, backend, dtype });
  }

  async function classifyMood(
    text: string,
    labels: readonly string[],
  ): Promise<MoodResult[]> {
    const result = await send<MoodResult[]>('classify-mood', {
      text,
      labels: Array.from(labels),
    });
    return result;
  }

  async function nliPair(premise: string, hypothesis: string): Promise<NliPairResult> {
    return await send<NliPairResult>('nli-pair', { premise, hypothesis });
  }

  return {
    isReady,
    isLoading,
    loadError,
    modelProgress,
    preload,
    configure,
    detectLanguage,
    detectSentiment,
    classifyMood,
    nliPair,
  };
}
