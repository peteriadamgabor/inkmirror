import { createSignal, Show } from 'solid-js';
import { connectDB } from '@/db/connection';
import { redeemPaircode, SyncHttpError } from '@/sync';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

interface Props {
  onClose: () => void;
  onConnected?: () => void;
}

/** Crockford-style Base32 alphabet — no 0, O, I, L (ambiguous characters). */
const VALID_PAIRCODE = /^[A-HJKMNP-Z2-9]{6}$/;

/** Uppercase + strip everything that isn't in the paircode alphabet (incl. dash separators). */
function normalizePaircode(input: string): string {
  return input.toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, '');
}

export function PairRedeemModal(props: Props) {
  const [paircode, setPaircode] = createSignal('');
  const [pass, setPass] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  // When 410: show a retry hint but keep the form usable
  const [expired, setExpired] = createSignal(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (busy()) return;
    setError(null);
    setExpired(false);

    const code = normalizePaircode(paircode());
    if (!VALID_PAIRCODE.test(code)) {
      setError(t('sync.connect.paircodeExpired'));
      setExpired(true);
      return;
    }
    if (pass().length < 1) {
      // The `required` attribute already gates this, but belt + braces:
      return;
    }

    setBusy(true);
    try {
      const db = await connectDB();
      await redeemPaircode({ db, baseUrl: '', paircode: code, passphrase: pass() });
      toast.success(t('sync.connect.connected', { n: 0 }));
      props.onConnected?.();
      props.onClose();
    } catch (err) {
      if (err instanceof SyncHttpError) {
        if (err.status === 401) {
          setError(t('sync.connect.wrongPassphrase'));
          setPass('');            // clear passphrase; keep paircode (still valid for TTL)
        } else if (err.status === 410) {
          setError(t('sync.connect.paircodeExpired'));
          setExpired(true);
        } else {
          setError(`http ${err.status}`);
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function resetForRetry() {
    setPaircode('');
    setPass('');
    setError(null);
    setExpired(false);
  }

  return (
    <ModalBackdrop onClick={props.onClose}>
      <div
        class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 max-w-md w-full mx-4 inkmirror-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-lg font-serif mb-2 text-stone-800 dark:text-stone-100">
          {t('sync.connect.title')}
        </h2>

        <form onSubmit={submit}>
          <input
            type="text"
            placeholder={t('sync.connect.paircodeLabel')}
            class="w-full mb-2 px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 font-mono uppercase tracking-widest focus:outline-none focus:border-violet-400 disabled:opacity-50"
            value={paircode()}
            onInput={(e) => setPaircode(e.currentTarget.value)}
            disabled={busy()}
            autofocus
            required
          />
          <input
            type="password"
            placeholder={t('sync.connect.passphraseLabel')}
            class="w-full mb-3 px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:border-violet-400 disabled:opacity-50"
            value={pass()}
            onInput={(e) => setPass(e.currentTarget.value)}
            disabled={busy()}
            required
          />

          <Show when={error()}>
            <p class="text-red-500 dark:text-red-400 text-sm mb-3">{error()}</p>
          </Show>

          <Show when={busy()}>
            <p class="text-stone-500 dark:text-stone-400 text-sm mb-3">
              {t('sync.passphrase.deriving')}
            </p>
          </Show>

          <div class="flex justify-end gap-2 mt-4">
            <Show when={expired()}>
              <button
                type="button"
                class="px-4 py-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200"
                onClick={resetForRetry}
              >
                {t('common.retry')}
              </button>
            </Show>
            <button
              type="button"
              class="px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100"
              onClick={props.onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy()}
              class="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {t('sync.connect.submit')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
