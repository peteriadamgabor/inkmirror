import { createSignal } from 'solid-js';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };

let nextId = 1;

export function pushToast(
  message: string,
  opts: { kind?: ToastKind; duration?: number } = {},
): number {
  const id = nextId++;
  const toast: Toast = {
    id,
    kind: opts.kind ?? 'info',
    message,
    duration: opts.duration ?? 3200,
  };
  setToasts((list) => [...list, toast]);
  if (toast.duration > 0) {
    setTimeout(() => dismissToast(id), toast.duration);
  }
  return id;
}

export function dismissToast(id: number): void {
  setToasts((list) => list.filter((t) => t.id !== id));
}

export const toast = {
  info: (m: string, d?: number) => pushToast(m, { kind: 'info', duration: d }),
  success: (m: string, d?: number) => pushToast(m, { kind: 'success', duration: d }),
  error: (m: string, d?: number) => pushToast(m, { kind: 'error', duration: d ?? 5000 }),
};
