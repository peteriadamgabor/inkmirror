import { createSignal } from 'solid-js';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
}

export interface ToastHistoryEntry extends Toast {
  timestamp: number;
}

const HISTORY_CAP = 20;

const [toasts, setToasts] = createSignal<Toast[]>([]);
const [toastHistory, setToastHistory] = createSignal<ToastHistoryEntry[]>([]);
export { toasts, toastHistory };

let nextId = 1;

function pushToast(
  message: string,
  opts: { kind?: ToastKind; duration?: number } = {},
): number {
  const id = nextId++;
  const entry: Toast = {
    id,
    kind: opts.kind ?? 'info',
    message,
    duration: opts.duration ?? 3200,
  };
  setToasts((list) => [...list, entry]);
  setToastHistory((list) => [
    { ...entry, timestamp: Date.now() },
    ...list,
  ].slice(0, HISTORY_CAP));
  if (entry.duration > 0) {
    setTimeout(() => dismissToast(id), entry.duration);
  }
  return id;
}

export function clearToastHistory(): void {
  setToastHistory([]);
}

export function dismissToast(id: number): void {
  setToasts((list) => list.filter((t) => t.id !== id));
}

export const toast = {
  info: (m: string, d?: number) => pushToast(m, { kind: 'info', duration: d }),
  success: (m: string, d?: number) => pushToast(m, { kind: 'success', duration: d }),
  error: (m: string, d?: number) => pushToast(m, { kind: 'error', duration: d ?? 5000 }),
};
