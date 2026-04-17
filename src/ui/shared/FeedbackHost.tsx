import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { closeFeedback, feedbackOpen, submitFeedback } from './feedback';
import { toast } from './toast';

export const FeedbackHost = () => {
  const [message, setMessage] = createSignal('');
  const [contact, setContact] = createSignal('');
  const [website, setWebsite] = createSignal(''); // honeypot
  const [startedAt, setStartedAt] = createSignal(Date.now());
  const [sending, setSending] = createSignal(false);

  // Reset form whenever the modal opens so a failed submit doesn't
  // leak stale content into a later session.
  const reset = () => {
    setMessage('');
    setContact('');
    setWebsite('');
    setStartedAt(Date.now());
    setSending(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!feedbackOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFeedback();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !sending()) {
      e.preventDefault();
      void send();
    }
  };

  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  // Reset form state each time the modal opens.
  createEffect(() => {
    if (feedbackOpen()) reset();
  });

  const send = async () => {
    const text = message().trim();
    if (text.length === 0) return;
    setSending(true);
    const result = await submitFeedback({
      message: text,
      contact: contact().trim(),
      website: website(),
      startedAt: startedAt(),
    });
    setSending(false);
    if (result.ok) {
      toast.success('Thanks — feedback sent.');
      closeFeedback();
      reset();
    } else {
      toast.error(`Couldn't send feedback: ${result.error}`);
    }
  };

  return (
    <Show when={feedbackOpen()}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm"
        onClick={() => closeFeedback()}
      >
        <div
          class="w-[520px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl p-5 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
        >
          <div>
            <div
              id="feedback-title"
              class="font-serif text-lg text-stone-900 dark:text-stone-100"
            >
              Send feedback
            </div>
            <div class="text-sm text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
              Bug, idea, or just a hello — it all lands in my inbox.
              Your manuscript content is never included.
            </div>
          </div>

          <textarea
            value={message()}
            onInput={(e) => setMessage(e.currentTarget.value)}
            placeholder="What's on your mind?"
            rows={6}
            maxLength={4000}
            ref={(el) => queueMicrotask(() => el.focus())}
            class="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-800 dark:text-stone-100 resize-none focus:outline-none focus:border-violet-500 transition-colors font-serif leading-relaxed"
          />

          <input
            type="email"
            value={contact()}
            onInput={(e) => setContact(e.currentTarget.value)}
            placeholder="Your email (optional — only if you want a reply)"
            maxLength={200}
            class="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-700 dark:text-stone-200 focus:outline-none focus:border-violet-500 transition-colors"
          />

          {/* Honeypot — hidden from humans, bots fill it. */}
          <input
            type="text"
            tabIndex={-1}
            autocomplete="off"
            value={website()}
            onInput={(e) => setWebsite(e.currentTarget.value)}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-10000px',
              width: '1px',
              height: '1px',
              opacity: 0,
            }}
          />

          <div class="flex items-center justify-between gap-2 pt-1">
            <div class="text-[11px] text-stone-400">
              {message().length > 0 ? `${message().length} / 4000` : '\u00A0'}
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => closeFeedback()}
                class="px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending() || message().trim().length === 0}
                class="px-3 py-1.5 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {sending() ? 'Sending…' : 'Send'}
                <Show when={!sending()}>
                  <span class="font-mono text-[10px] opacity-70">⌘↵</span>
                </Show>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
