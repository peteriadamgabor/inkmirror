import { createSignal, Show, onCleanup } from 'solid-js';
import { connectDB } from '@/db/connection';
import { initCircle, issuePaircode } from '@/sync';
import { generatePassphrase } from '@/sync/wordlist';
import { passphraseStrength } from '@/sync/strength';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { IconEye, IconEyeOff } from '@/ui/shared/icons';
import { t } from '@/i18n';

type Step =
  | { kind: 'passphrase' }
  | { kind: 'deriving' }
  | { kind: 'done'; syncId: string }
  | { kind: 'paircode'; code: string; expiresAt: number };

interface Props {
  onClose: () => void;
}

export function PairingSetupModal(props: Props) {
  const [step, setStep] = createSignal<Step>({ kind: 'passphrase' });
  const [pass, setPass] = createSignal('');
  const [confirm, setConfirm] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [reveal, setReveal] = createSignal(false);

  async function submitPassphrase(e: Event) {
    e.preventDefault();
    setError(null);

    if (pass() !== confirm()) {
      setError(t('sync.passphrase.mismatch'));
      return;
    }
    if (passphraseStrength(pass()) === 'weak') {
      setError(t('sync.passphrase.tooWeak'));
      return;
    }

    setStep({ kind: 'deriving' });
    try {
      const db = await connectDB();
      const { syncId } = await initCircle({ db, baseUrl: '', passphrase: pass() });
      setStep({ kind: 'done', syncId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: 'passphrase' });
    }
  }

  async function showCode() {
    const s = step();
    if (s.kind !== 'done') return;
    try {
      const db = await connectDB();
      const r = await issuePaircode({ db, baseUrl: '', syncId: s.syncId });
      setStep({
        kind: 'paircode',
        code: r.paircode,
        expiresAt: new Date(r.expiresAt).getTime(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const strength = () => passphraseStrength(pass());

  return (
    <ModalBackdrop onClick={props.onClose}>
      <div
        class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Show when={step().kind === 'passphrase'}>
          <h2 class="text-lg font-serif mb-2 text-stone-800 dark:text-stone-100">
            {t('sync.passphrase.title')}
          </h2>
          <p class="text-sm text-stone-500 dark:text-stone-400 mb-4">
            {t('sync.passphrase.explanation')}
          </p>
          <form onSubmit={submitPassphrase}>
            <div class="relative mb-2">
              <input
                type={reveal() ? 'text' : 'password'}
                placeholder={t('sync.passphrase.label')}
                class="w-full px-3 py-2 pr-10 border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:border-violet-400 font-mono"
                value={pass()}
                onInput={(e) => setPass(e.currentTarget.value)}
                autocomplete="new-password"
                spellcheck={false}
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200 transition-colors"
                onClick={() => setReveal((r) => !r)}
                title={reveal() ? t('sync.passphrase.hide') : t('sync.passphrase.show')}
                aria-label={reveal() ? t('sync.passphrase.hide') : t('sync.passphrase.show')}
                aria-pressed={reveal()}
              >
                {reveal() ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
            <input
              type={reveal() ? 'text' : 'password'}
              placeholder={t('sync.passphrase.confirm')}
              class="w-full mb-3 px-3 py-2 border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:border-violet-400 font-mono"
              value={confirm()}
              onInput={(e) => setConfirm(e.currentTarget.value)}
              autocomplete="new-password"
              spellcheck={false}
            />

            <Show when={pass().length > 0}>
              <div class="flex items-center gap-2 mb-3">
                <div class="flex gap-1">
                  <div
                    class={`h-1.5 w-8 rounded-full ${strength() === 'weak' ? 'bg-red-400' : strength() === 'medium' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  />
                  <div
                    class={`h-1.5 w-8 rounded-full ${strength() === 'medium' ? 'bg-amber-400' : strength() === 'strong' ? 'bg-emerald-500' : 'bg-stone-200 dark:bg-stone-600'}`}
                  />
                  <div
                    class={`h-1.5 w-8 rounded-full ${strength() === 'strong' ? 'bg-emerald-500' : 'bg-stone-200 dark:bg-stone-600'}`}
                  />
                </div>
                <span class="text-xs text-stone-500 dark:text-stone-400">
                  {strength() === 'weak'
                    ? t('sync.passphrase.strengthWeak')
                    : strength() === 'medium'
                      ? t('sync.passphrase.strengthMedium')
                      : t('sync.passphrase.strengthStrong')}
                </span>
              </div>
            </Show>

            <button
              type="button"
              class="text-sm text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 mb-3 block"
              onClick={() => {
                const g = generatePassphrase();
                setPass(g);
                setConfirm(g);
                // The whole point of generation is the user reading and saving
                // the result somewhere — auto-reveal so it's not buried as dots.
                setReveal(true);
              }}
            >
              {t('sync.passphrase.generate')}
            </button>

            <Show when={error()}>
              <p class="text-red-500 text-sm mb-3">{error()}</p>
            </Show>

            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                class="px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100"
                onClick={props.onClose}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                class="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t('common.confirm')}
              </button>
            </div>
          </form>
        </Show>

        <Show when={step().kind === 'deriving'}>
          <p class="text-center py-8 text-stone-600 dark:text-stone-300 inkmirror-mirror-breath">
            {t('sync.passphrase.deriving')}
          </p>
        </Show>

        <Show when={step().kind === 'done'}>
          <p class="text-center py-4 text-stone-800 dark:text-stone-100">
            ✓ {t('sync.on')}
          </p>
          <Show when={error()}>
            <p class="text-red-500 text-sm text-center mb-3">{error()}</p>
          </Show>
          <div class="flex justify-center gap-2 mt-4">
            <button
              onClick={showCode}
              class="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {t('sync.addDevice')}
            </button>
            <button
              onClick={props.onClose}
              class="px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100"
            >
              {t('common.done')}
            </button>
          </div>
        </Show>

        <Show when={step().kind === 'paircode'}>
          <PairCodeDisplay
            step={step() as Extract<Step, { kind: 'paircode' }>}
            onClose={props.onClose}
          />
        </Show>
      </div>
    </ModalBackdrop>
  );
}

function PairCodeDisplay(props: {
  step: Extract<Step, { kind: 'paircode' }>;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = createSignal(
    Math.max(0, Math.ceil((props.step.expiresAt - Date.now()) / 1000)),
  );

  const interval = setInterval(() => {
    const r = Math.max(0, Math.ceil((props.step.expiresAt - Date.now()) / 1000));
    setRemaining(r);
    if (r === 0) clearInterval(interval);
  }, 1000);
  onCleanup(() => clearInterval(interval));

  const formatted = () => {
    const r = remaining();
    const mins = Math.floor(r / 60);
    const secs = String(r % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div>
      <div class="text-3xl font-mono text-center my-6 inkmirror-smallcaps tracking-widest text-stone-800 dark:text-stone-100">
        {props.step.code.slice(0, 3)} – {props.step.code.slice(3)}
      </div>
      <p class="text-sm font-medium text-stone-700 dark:text-stone-200 mb-1">
        {t('sync.paircode.instructionsTitle')}
      </p>
      <p class="text-sm text-stone-600 dark:text-stone-300">{t('sync.paircode.step1')}</p>
      <p class="text-sm text-stone-600 dark:text-stone-300">{t('sync.paircode.step2')}</p>
      <p class="text-sm text-stone-600 dark:text-stone-300">{t('sync.paircode.step3')}</p>
      <p class="text-sm text-stone-500 dark:text-stone-400 mt-3 tabular-nums">
        {t('sync.paircode.expires', { time: formatted() })}
      </p>
      <div class="flex justify-end mt-4">
        <button
          onClick={props.onClose}
          class="px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
