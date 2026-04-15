import { createSignal } from 'solid-js';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const [pending, setPending] = createSignal<PendingConfirm | null>(null);
export { pending as pendingConfirm };

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  // If a confirm is already open, resolve it as cancelled before replacing.
  const current = pending();
  if (current) current.resolve(false);
  return new Promise<boolean>((resolve) => {
    setPending({ ...opts, resolve });
  });
}

export function resolveConfirm(value: boolean): void {
  const current = pending();
  if (!current) return;
  setPending(null);
  current.resolve(value);
}
