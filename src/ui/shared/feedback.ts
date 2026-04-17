import { createSignal } from 'solid-js';

const [open, setOpen] = createSignal(false);
export { open as feedbackOpen };

export function openFeedback(): void {
  setOpen(true);
}

export function closeFeedback(): void {
  setOpen(false);
}

export interface FeedbackPayload {
  message: string;
  contact: string;
  website: string; // honeypot
  startedAt: number;
}

export async function submitFeedback(
  payload: FeedbackPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (res.ok && body.ok) return { ok: true };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
