import { createSignal, For, onCleanup, onMount, type JSX } from 'solid-js';
import { SiteNav } from '@/ui/layout/SiteNav';
import { FeedbackHost } from '@/ui/shared/FeedbackHost';
import { openFeedback } from '@/ui/shared/feedback';
import { t } from '@/i18n';

type Status = 'shipped' | 'inProgress' | 'planned' | 'maybe';

/** A divider rendered as the app's mirror-line gradient. */
const MirrorDivider = () => (
  <div
    class="w-32 mx-auto my-16 h-px"
    style={{
      background:
        'linear-gradient(to right, transparent, rgba(127,119,221,0.45), transparent)',
    }}
  />
);

/** Small uppercase status chip using the existing smallcaps class. */
const StatusChip = (props: { status: Status }) => {
  const labelKey = `roadmap.status.${props.status}` as const;
  const tone = () => {
    switch (props.status) {
      case 'shipped':
        return 'text-emerald-400/80 border-emerald-400/30';
      case 'inProgress':
        return 'text-violet-400/90 border-violet-400/40';
      case 'planned':
        return 'text-sky-400/80 border-sky-400/30';
      case 'maybe':
        return 'text-stone-400/70 border-stone-500/30';
    }
  };
  return (
    <span
      class={`inkmirror-smallcaps text-[10px] tracking-widest px-2 py-0.5 rounded-full border ${tone()}`}
    >
      {t(labelKey)}
    </span>
  );
};

/**
 * Scroll-in wrapper: adds the mirror-breath class when the section
 * enters the viewport. Reuses the existing keyframes in index.css, so
 * no new motion to ship and prefers-reduced-motion is already
 * respected.
 */
const SectionReveal = (props: { children: JSX.Element; class?: string }) => {
  let ref!: HTMLDivElement;
  const [visible, setVisible] = createSignal(false);

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    io.observe(ref);
    onCleanup(() => io.disconnect());
  });

  return (
    <div
      ref={ref}
      class={`transition-opacity duration-[900ms] ease-out ${props.class ?? ''}`}
      classList={{
        'opacity-100 inkmirror-mirror-breath': visible(),
        'opacity-0 translate-y-2': !visible(),
      }}
      style={{ transform: visible() ? 'none' : 'translateY(8px)' }}
    >
      {props.children}
    </div>
  );
};

const PLANNED_ITEMS: Array<{ key: string; maybe?: boolean }> = [
  { key: 'roadmap.planned.i1' },
  { key: 'roadmap.planned.i2' },
  { key: 'roadmap.planned.i3', maybe: true },
  { key: 'roadmap.planned.i4', maybe: true },
  { key: 'roadmap.planned.i5' },
  { key: 'roadmap.planned.i6' },
  { key: 'roadmap.planned.i7' },
];

const SectionHeader = (props: { status: Status; title: string }) => (
  <div class="flex items-center gap-3 mb-6">
    <h2 class="font-serif text-3xl md:text-4xl tracking-tight text-stone-100">
      {props.title}
    </h2>
    <StatusChip status={props.status} />
  </div>
);

export const RoadmapRoute = () => {
  // Reflect the current t('roadmap.pageTitle') in the tab title.
  onMount(() => {
    const prev = document.title;
    document.title = t('roadmap.pageTitle');
    onCleanup(() => {
      document.title = prev;
    });
  });

  return (
    <div class="min-h-screen bg-stone-950 text-stone-100 font-sans inkmirror-paper">
      <SiteNav current="/roadmap" />
      <FeedbackHost />

      <main class="max-w-2xl mx-auto px-6 pt-32 pb-24 font-serif text-stone-300 leading-relaxed text-[17px]">
        {/* --- Opening --- */}
        <SectionReveal>
          <h1 class="font-serif text-4xl md:text-5xl tracking-tight text-stone-100 mb-6">
            {t('roadmap.opening.header')}
          </h1>
          <p class="text-stone-400">{t('roadmap.opening.body')}</p>
        </SectionReveal>

        <MirrorDivider />

        {/* --- Shipped --- */}
        <SectionReveal>
          <SectionHeader
            status="shipped"
            title={t('roadmap.shipped.header')}
          />
          <p class="text-stone-400 mb-5">{t('roadmap.shipped.intro')}</p>
          <p class="mb-5">{t('roadmap.shipped.p1')}</p>
          <p class="mb-5">{t('roadmap.shipped.p2')}</p>
          <p class="mb-5">{t('roadmap.shipped.p3')}</p>
          <p>{t('roadmap.shipped.p4')}</p>
        </SectionReveal>

        <MirrorDivider />

        {/* --- In progress --- */}
        <SectionReveal>
          <SectionHeader
            status="inProgress"
            title={t('roadmap.inProgress.header')}
          />
          <p class="text-stone-400 mb-5">{t('roadmap.inProgress.intro')}</p>
          <p class="mb-5">{t('roadmap.inProgress.p1')}</p>
          <p class="mb-5">{t('roadmap.inProgress.p2')}</p>
          <p>{t('roadmap.inProgress.p3')}</p>
        </SectionReveal>

        <MirrorDivider />

        {/* --- Planned --- */}
        <SectionReveal>
          <SectionHeader status="planned" title={t('roadmap.planned.header')} />
          <p class="text-stone-400 mb-5">{t('roadmap.planned.intro')}</p>
          <ul class="space-y-5">
            <For each={PLANNED_ITEMS}>
              {(item) => (
                <li class="flex items-start gap-3">
                  <span class="text-violet-500 mt-2 shrink-0 text-xs">◆</span>
                  <div>
                    <p class="inline">{t(item.key)}</p>
                    {item.maybe && (
                      <>
                        {' '}
                        <StatusChip status="maybe" />
                      </>
                    )}
                  </div>
                </li>
              )}
            </For>
          </ul>
        </SectionReveal>

        <MirrorDivider />

        {/* --- Closing --- */}
        <SectionReveal>
          <h2 class="font-serif text-3xl md:text-4xl tracking-tight text-stone-100 mb-6">
            {t('roadmap.closing.header')}
          </h2>
          <p class="text-stone-400 mb-8">{t('roadmap.closing.body')}</p>
          <button
            type="button"
            onClick={() => openFeedback()}
            class="inline-block px-6 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-sans font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
          >
            {t('roadmap.closing.cta')}
          </button>
        </SectionReveal>
      </main>
    </div>
  );
};
