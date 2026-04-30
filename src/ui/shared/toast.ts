import { createSignal } from 'solid-js';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  /** Called when the user clicks the action button. The toast is dismissed
   *  after the handler runs unless `keepOpen` is true. */
  handler: () => void;
  /** Default false — clicking dismisses the toast. Set true if the action
   *  itself navigates / reloads and dismissal would just be racing the
   *  unload. */
  keepOpen?: boolean;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
  /** Optional inline action (e.g., "Reload to apply"). When present, the
   *  toast does not auto-dismiss unless `duration > 0` is passed. */
  action?: ToastAction;
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
  opts: { kind?: ToastKind; duration?: number; action?: ToastAction } = {},
): number {
  const id = nextId++;
  // Default duration: 3.2s for plain toasts, sticky (0) when there's an
  // action — actions deserve a deliberate user click, not a 3-second window.
  const defaultDuration = opts.action ? 0 : 3200;
  const entry: Toast = {
    id,
    kind: opts.kind ?? 'info',
    message,
    duration: opts.duration ?? defaultDuration,
    action: opts.action,
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
  /** Toast with an inline action button. Sticky by default — pass a
   *  positive `duration` if you want it to time out anyway. */
  withAction: (
    m: string,
    action: ToastAction,
    opts: { kind?: ToastKind; duration?: number } = {},
  ) => pushToast(m, { kind: opts.kind ?? 'info', duration: opts.duration, action }),
};
