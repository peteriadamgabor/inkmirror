import { For } from 'solid-js';
import { LanguagePicker } from '@/ui/shared/LanguagePicker';
import { t } from '@/i18n';

const FEATURE_ACCENTS = [
  'text-teal-500',
  'text-emerald-500',
  'text-orange-500',
  'text-violet-500',
  'text-rose-500',
  'text-sky-500',
];

const FEATURES = [1, 2, 3, 4, 5, 6].map((n) => ({
  titleKey: `landing.features.f${n}Title`,
  descKey: `landing.features.f${n}Desc`,
  accent: FEATURE_ACCENTS[n - 1],
}));

const MORE = Array.from({ length: 16 }, (_, i) => `landing.more.item${i + 1}`);

export const LandingRoute = () => (
  <div class="bg-stone-950 text-stone-100 font-sans scroll-smooth">
    {/* Fixed top-right: language picker, available on every scroll position. */}
    <div class="fixed top-4 right-4 z-50">
      <LanguagePicker tone="onDark" />
    </div>
    {/* --- Hero --- */}
    <section class="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-b from-violet-950/40 via-stone-950 to-stone-950 pointer-events-none" />
      <div class="relative z-10 max-w-2xl">
        {/* Two hearts icon */}
        <div class="flex items-center justify-center gap-3 mb-8">
          <div class="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-violet-500" />
          </div>
          <div class="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
            <div class="w-8 h-8 rounded-full bg-orange-600" />
          </div>
        </div>
        <div class="relative mb-4">
          <h1 class="font-serif text-5xl md:text-7xl tracking-tight">
            InkMirror
          </h1>
          {/* Mirror surface line */}
          <div
            class="w-48 h-px mx-auto mt-2 mb-1"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(127,119,221,0.6), transparent)',
            }}
          />
          {/* Mirror reflection */}
          <div
            class="font-serif text-5xl md:text-7xl tracking-tight select-none pointer-events-none text-violet-300 inkmirror-mirror-breath"
            style={{
              'mask-image': 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 80%)',
              '-webkit-mask-image': 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 80%)',
              'line-height': '1',
              filter: 'blur(0.5px)',
            }}
            aria-hidden="true"
          >
            InkMirror
          </div>
        </div>
        <p class="text-xl md:text-2xl text-stone-400 leading-relaxed mb-3">
          {t('landing.hero.title1')}<br />
          {t('landing.hero.title2')}
        </p>
        <p class="text-base text-stone-500 max-w-lg mx-auto mb-10">
          {t('landing.hero.subtitle')}
        </p>
        <a
          href="/"
          class="inline-block px-8 py-3 rounded-xl bg-violet-500 text-white text-lg font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
        >
          {t('landing.hero.cta')}
        </a>
        <p class="mt-4 text-xs text-stone-600">
          {t('landing.hero.smallPrint')}
        </p>
      </div>
      <div class="absolute bottom-8 text-stone-600 animate-bounce">
        ↓
      </div>
    </section>

    {/* --- Features --- */}
    <section class="py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <h2 class="font-serif text-3xl md:text-4xl text-center mb-4">
          {t('landing.features.heading')}
        </h2>
        <p class="text-stone-500 text-center mb-16 max-w-xl mx-auto">
          {t('landing.features.subheading')}
        </p>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <For each={FEATURES}>
            {(f) => (
              <div class="rounded-2xl border border-stone-800 bg-stone-900/50 p-6 hover:border-stone-700 transition-colors">
                <div class={`text-sm font-medium mb-2 ${f.accent}`}>
                  {t(f.titleKey)}
                </div>
                <p class="text-sm text-stone-400 leading-relaxed">
                  {t(f.descKey)}
                </p>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>

    {/* --- Philosophy --- */}
    <section class="py-24 px-6 bg-stone-900/30">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="font-serif text-3xl md:text-4xl mb-6">
          {t('landing.philosophy.heading')}
        </h2>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          {t('landing.philosophy.p1')}
        </p>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          {t('landing.philosophy.p2Before')}
          <em class="text-stone-200">{t('landing.philosophy.p2Analyzes')}</em>
          {t('landing.philosophy.p2Middle')}
          <em class="text-stone-200">{t('landing.philosophy.p2Feels')}</em>
          {t('landing.philosophy.p2After')}
        </p>
        <p class="text-lg text-stone-300 font-serif italic">
          {t('landing.philosophy.closing')}
        </p>
      </div>
    </section>

    {/* --- Privacy --- */}
    <section class="py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="font-serif text-3xl md:text-4xl mb-6">
          {t('landing.privacy.heading')}
        </h2>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          {t('landing.privacy.body')}
        </p>
        <div class="grid md:grid-cols-3 gap-6 mt-12">
          <div class="text-center">
            <div class="text-2xl mb-2">🔒</div>
            <div class="text-sm font-medium text-stone-200 mb-1">{t('landing.privacy.cardTelemetryTitle')}</div>
            <div class="text-xs text-stone-500">{t('landing.privacy.cardTelemetryBody')}</div>
          </div>
          <div class="text-center">
            <div class="text-2xl mb-2">✈️</div>
            <div class="text-sm font-medium text-stone-200 mb-1">{t('landing.privacy.cardOfflineTitle')}</div>
            <div class="text-xs text-stone-500">{t('landing.privacy.cardOfflineBody')}</div>
          </div>
          <div class="text-center">
            <div class="text-2xl mb-2">📦</div>
            <div class="text-sm font-medium text-stone-200 mb-1">{t('landing.privacy.cardExportTitle')}</div>
            <div class="text-xs text-stone-500">{t('landing.privacy.cardExportBody')}</div>
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
      <a
        href="/"
        class="inline-block px-10 py-4 rounded-xl bg-violet-500 text-white text-xl font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
      >
        {t('landing.cta.button')}
      </a>
    </section>

    {/* --- Footer --- */}
    <footer class="py-8 px-6 border-t border-stone-800 text-center text-xs text-stone-600">
      {t('landing.footer')}
    </footer>
  </div>
);
