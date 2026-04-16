import { createSignal } from 'solid-js';

export type ConfirmResult = 'confirm' | 'neutral' | 'cancel';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When set, a third middle button is rendered. Enables tri-state choice. */
  neutralLabel?: string;
  danger?: boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (value: ConfirmResult) => void;
}

const [pending, setPending] = createSignal<PendingConfirm | null>(null);
export { pending as pendingConfirm };

/** Tri-state choice. Returns 'confirm' | 'neutral' | 'cancel'. */
export function askConfirmChoice(opts: ConfirmOptions): Promise<ConfirmResult> {
  // If a confirm is already open, cancel it before replacing.
  const current = pending();
  if (current) current.resolve('cancel');
  return new Promise<ConfirmResult>((resolve) => {
    setPending({ ...opts, resolve });
  });
}

/** Classic yes/no. Maps cancel and neutral both to false. */
export async function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  const result = await askConfirmChoice(opts);
  return result === 'confirm';
}

export function resolveConfirm(value: ConfirmResult): void {
  const current = pending();
  if (!current) return;
  setPending(null);
  current.resolve(value);
}
