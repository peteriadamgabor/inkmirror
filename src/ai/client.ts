import { createSignal, type Accessor } from 'solid-js';
import { logAiError } from './errors';

export interface LanguageResult {
  label: string;
  score: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface AiClientHandle {
  isReady: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  loadError: Accessor<string | null>;
  preload: () => Promise<void>;
  detectLanguage: (text: string) => Promise<LanguageResult[]>;
}

const REQUEST_TIMEOUT_MS = 60_000;

export interface AiClientDeps {
  createWorker: () => Worker;
}

export function createAiClient(deps: AiClientDeps): AiClientHandle {
  const [isReady, setIsReady] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);

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
      return;
    }
    if (msg && msg.kind === 'progress') {
      // Optional hook — currently just dropped. Could set a signal later.
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

  return {
    isReady,
    isLoading,
    loadError,
    preload,
    detectLanguage,
  };
}
