import { createSignal, For } from 'solid-js';
import { SiteNav } from '@/ui/layout/SiteNav';
import { markVisited } from '@/ui/shared/first-visit';
import { FeedbackHost } from '@/ui/shared/FeedbackHost';
import { ConfirmHost } from '@/ui/shared/ConfirmHost';
import { ToastHost } from '@/ui/shared/ToastHost';
import { openDemo } from '@/backup/demo';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

const FEATURE_ORDINALS = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.'];

// Two-hearts alternation: i, iii, v carry the writer-violet kicker;
// ii, iv, vi carry story-orange. Same intent as before, retuned for
// the new cream surface.
const FEATURE_ACCENTS = [
  'text-violet-600',
  'text-orange-600',
  'text-violet-600',
  'text-orange-600',
  'text-violet-600',
  'text-orange-600',
];

const FEATURES = [1, 2, 3, 4, 5, 6].map((n) => ({
  ordinal: FEATURE_ORDINALS[n - 1],
  titleKey: `landing.features.f${n}Title`,
  descKey: `landing.features.f${n}Desc`,
  accent: FEATURE_ACCENTS[n - 1],
}));

const MORE = Array.from({ length: 20 }, (_, i) => `landing.more.item${i + 1}`);

export const LandingRoute = () => {
  const [demoLoading, setDemoLoading] = createSignal(false);

  /**
   * "Try the demo" click handler. Imports the demo bundle (or triggers
   * collision UI if already present), marks the visitor as having
   * visited, then navigates to / so the editor auto-opens the demo
   * (sole document → auto-open in the boot path).
   */
  const handleDemo = async (e: MouseEvent) => {
    e.preventDefault();
    if (demoLoading()) return;
    setDemoLoading(true);
    try {
      const result = await openDemo();
      if (result.kind === 'error') {
        toast.error(t('demo.openFailed', { error: result.error }));
        setDemoLoading(false);
        return;
      }
      // Even when the user cancelled the collision prompt they already
      // have the demo in their library — still navigate so the click
      // isn't wasted.
      markVisited();
      if (result.kind === 'imported' || result.kind === 'replaced') {
        toast.success(t('demo.openedToast'));
      }
      window.location.href = '/';
    } catch (err) {
      toast.error(
        t('demo.openFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      setDemoLoading(false);
    }
  };

  return (
    <div class="inkmirror-public-page inkmirror-paper scroll-smooth">
      <SiteNav current="/landing" />
      <FeedbackHost />
      <ConfirmHost />
      <ToastHost />
    {/* --- Hero --- */}
    <section class="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden pt-24 pb-16">
      <div class="relative z-10 max-w-2xl">
        {/* Two hearts — kept as-is, recalibrated for cream */}
        <div class="flex items-center justify-center gap-3 mb-8">
          <div class="w-16 h-16 rounded-full bg-violet-500/15 flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-violet-500" />
          </div>
          <div class="w-16 h-16 rounded-full bg-orange-500/15 flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-orange-600" />
          </div>
        </div>

        <div class="relative mb-4">
          <h1 class="font-serif text-5xl md:text-7xl tracking-tight text-stone-900 dark:text-stone-100">
            InkMirror
          </h1>
          {/* Mirror surface line — existing motif, retuned opacity for cream */}
          <div
            class="w-48 h-px mx-auto mt-2 mb-1"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(127,119,221,0.55), transparent)',
            }}
          />
          {/* Mirror reflection — slightly stronger violet so it reads on cream */}
          <div
            class="font-serif text-5xl md:text-7xl tracking-tight select-none pointer-events-none text-violet-400 dark:text-violet-300 inkmirror-mirror-breath"
            style={{
              'mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 80%)',
              '-webkit-mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 80%)',
              'line-height': '1',
              filter: 'blur(0.5px)',
            }}
            aria-hidden="true"
          >
            InkMirror
          </div>
        </div>

        <p class="text-xl md:text-2xl text-stone-700 dark:text-stone-300 leading-relaxed mb-3 font-serif">
          {t('landing.hero.title1')}<br />
          {t('landing.hero.title2')}
        </p>
        <p class="text-base text-stone-500 dark:text-stone-500 max-w-lg mx-auto mb-10">
          {t('landing.hero.subtitle')}
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          <a
            href="/"
            onClick={() => markVisited()}
            class="inline-block px-8 py-3 rounded-xl bg-violet-500 text-white text-lg font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/15"
          >
            {t('landing.hero.cta')}
          </a>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading()}
            class="text-sm text-stone-600 dark:text-stone-400 hover:text-violet-600 dark:hover:text-violet-300 underline underline-offset-4 decoration-stone-300 dark:decoration-stone-700 hover:decoration-violet-400 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {demoLoading() ? `${t('demo.ctaLanding')}…` : t('demo.ctaLanding')}
          </button>
        </div>
        <p class="mt-4 text-xs text-stone-500 dark:text-stone-600">
          {t('landing.hero.smallPrint')}
        </p>
      </div>
      {/* Bouncy ↓ arrow removed intentionally. */}
    </section>

    {/* --- Features --- */}
    <section class="py-24 px-6">
      <div class="max-w-3xl mx-auto">
        <p class="inkmirror-smallcaps tracking-widest text-xs text-stone-500 dark:text-stone-400 text-center mb-3">
          {t('landing.features.kicker')}
        </p>
        <h2 class="font-serif text-3xl md:text-4xl text-center mb-4 text-stone-900 dark:text-stone-100">
          {t('landing.features.heading')}
        </h2>
        <p class="text-stone-600 dark:text-stone-400 text-center mb-16 max-w-xl mx-auto leading-relaxed">
          {t('landing.features.subheading')}
        </p>

        <ol class="list-none p-0 m-0 max-w-2xl mx-auto">
          <For each={FEATURES}>
            {(f, i) => (
              <li
                class="grid gap-x-5 gap-y-1 py-7"
                style={{ 'grid-template-columns': '3rem 1fr' }}
                classList={{ 'border-t border-stone-300/40 dark:border-stone-700/40': i() > 0 }}
              >
                <span class={`font-serif italic text-2xl leading-none mt-1 ${f.accent}`}>
                  {f.ordinal}
                </span>
                <div>
                  <div class="font-serif text-lg text-stone-900 dark:text-stone-100 mb-1">
                    {t(f.titleKey)}
                  </div>
                  <p class="text-stone-600 dark:text-stone-400 leading-relaxed">
                    {t(f.descKey)}
                  </p>
                </div>
              </li>
            )}
          </For>
        </ol>
      </div>
    </section>

    {/* --- Philosophy --- */}
    <section class="py-28 px-6">
      <div class="max-w-3xl mx-auto text-center">
        <div class="inkmirror-hairline-neutral mx-auto mb-12" style={{ width: '14rem' }} />
        <p class="inkmirror-smallcaps tracking-widest text-xs text-stone-500 dark:text-stone-400 mb-3">
          {t('landing.philosophy.kicker')}
        </p>
        <h2 class="font-serif text-3xl md:text-4xl mb-8 text-stone-900 dark:text-stone-100">
          {t('landing.philosophy.heading')}
        </h2>
        <p class="text-lg text-stone-700 dark:text-stone-300 leading-relaxed mb-6 font-serif">
          {t('landing.philosophy.p1')}
        </p>
        <p class="text-lg text-stone-700 dark:text-stone-300 leading-relaxed mb-8 font-serif">
          {t('landing.philosophy.p2Before')}
          <em class="text-stone-900 dark:text-stone-100 not-italic font-serif italic">
            {t('landing.philosophy.p2Analyzes')}
          </em>
          {t('landing.philosophy.p2Middle')}
          <em class="text-stone-900 dark:text-stone-100 not-italic font-serif italic">
            {t('landing.philosophy.p2Feels')}
          </em>
          {t('landing.philosophy.p2After')}
        </p>
        <p class="text-lg text-stone-800 dark:text-stone-200 font-serif italic">
          {t('landing.philosophy.closing')}
        </p>
        <div class="inkmirror-hairline-neutral mx-auto mt-12" style={{ width: '14rem' }} />
      </div>
    </section>

    {/* --- Privacy --- */}
    <section class="py-24 px-6">
      <div class="max-w-2xl mx-auto text-center">
        <p class="inkmirror-smallcaps tracking-widest text-xs text-stone-500 dark:text-stone-400 mb-3">
          {t('landing.privacy.kicker')}
        </p>
        <h2 class="font-serif text-3xl md:text-4xl mb-6 text-stone-900 dark:text-stone-100">
          {t('landing.privacy.heading')}
        </h2>
        <p class="text-stone-700 dark:text-stone-300 leading-relaxed mb-12 font-serif text-lg max-w-xl mx-auto">
          {t('landing.privacy.body')}
        </p>

        <div class="text-left">
          <div class="py-6">
            <p class="inkmirror-smallcaps tracking-widest text-xs text-violet-600 dark:text-violet-300 mb-2">
              {t('landing.privacy.stanza1Label')}
            </p>
            <p class="text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
              {t('landing.privacy.stanza1Body')}
            </p>
          </div>
          <div class="inkmirror-hairline-neutral" />
          <div class="py-6">
            <p class="inkmirror-smallcaps tracking-widest text-xs text-orange-600 dark:text-orange-400 mb-2">
              {t('landing.privacy.stanza2Label')}
            </p>
            <p class="text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
              {t('landing.privacy.stanza2Body')}
            </p>
          </div>
          <div class="inkmirror-hairline-neutral" />
          <div class="py-6">
            <p class="inkmirror-smallcaps tracking-widest text-xs text-violet-600 dark:text-violet-300 mb-2">
              {t('landing.privacy.stanza3Label')}
            </p>
            <p class="text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
              {t('landing.privacy.stanza3Body')}
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* --- Everything else --- */}
    <section class="py-24 px-6 bg-stone-900/30">
      <div class="max-w-4xl mx-auto">
        <h2 class="font-serif text-3xl md:text-4xl text-center mb-12">
          {t('landing.more.heading')}
        </h2>
        <div class="grid md:grid-cols-2 gap-x-8 gap-y-3">
          <For each={MORE}>
            {(item) => (
              <div class="flex items-start gap-2 text-sm text-stone-400">
                <span class="text-violet-500 mt-0.5 shrink-0">·</span>
                <span>{t(item)}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>

    {/* --- CTA --- */}
    <section class="py-32 px-6 text-center">
      <h2 class="font-serif text-4xl md:text-5xl mb-4">
        {t('landing.cta.heading')}
      </h2>
      <p class="text-stone-500 mb-10 text-lg">
        {t('landing.cta.subheading')}
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
        <a
          href="/"
          onClick={() => markVisited()}
          class="inline-block px-10 py-4 rounded-xl bg-violet-500 text-white text-xl font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
        >
          {t('landing.cta.button')}
        </a>
        <button
          type="button"
          onClick={handleDemo}
          disabled={demoLoading()}
          class="text-base text-stone-400 hover:text-violet-300 underline underline-offset-4 decoration-stone-700 hover:decoration-violet-400 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {demoLoading() ? `${t('demo.ctaLanding')}…` : t('demo.ctaLanding')}
        </button>
      </div>
    </section>

    {/* --- Footer --- */}
      <footer class="py-8 px-6 border-t border-stone-800 text-center text-xs text-stone-600">
        {t('landing.footer')}
      </footer>
    </div>
  );
};
