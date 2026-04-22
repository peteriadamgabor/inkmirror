import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { LanguagePicker } from '@/ui/shared/LanguagePicker';
import { openFeedback } from '@/ui/shared/feedback';
import { t } from '@/i18n';

interface Props {
  /** Pathname of the active page so the matching nav item lights up. */
  current: '/landing' | '/roadmap';
}

/**
 * Shared top bar for the public surface of the app (landing + roadmap).
 * Transparent until the user scrolls past the hero, then picks up a
 * subtle backdrop-blur and a faint violet mirror-line under it.
 *
 * Why shared: landing and roadmap should feel like one product — the
 * nav is the thread that holds them together visually.
 */
export const SiteNav = (props: Props) => {
  const [scrolled, setScrolled] = createSignal(false);
  const [mobileOpen, setMobileOpen] = createSignal(false);

  const onScroll = () => setScrolled(window.scrollY > 40);
  onMount(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });
  onCleanup(() => window.removeEventListener('scroll', onScroll));

  const isCurrent = (path: Props['current']) => props.current === path;

  const linkClass = (active: boolean) =>
    active
      ? 'text-violet-400 border-b border-violet-500/60'
      : 'text-stone-400 hover:text-violet-400 border-b border-transparent';

  return (
    <>
      <nav
        aria-label={t('aria.site')}
        class="fixed top-0 left-0 right-0 z-50 transition-[background,backdrop-filter,border-color] duration-300"
        classList={{
          'bg-stone-950/70 backdrop-blur-md border-b border-stone-800/60': scrolled(),
          'bg-transparent border-b border-transparent': !scrolled(),
        }}
      >
        <div class="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          {/* Left: wordmark */}
          <a
            href="/landing"
            class="font-serif text-stone-200 hover:text-white transition-colors text-sm tracking-tight"
          >
            {t('nav.home')}
          </a>

          {/* Right: nav + controls (desktop) */}
          <div class="hidden sm:flex items-center gap-5">
            <a
              href="/roadmap"
              class={`text-xs font-sans pb-0.5 transition-colors ${linkClass(isCurrent('/roadmap'))}`}
            >
              {t('nav.roadmap')}
            </a>
            <button
              type="button"
              onClick={() => openFeedback()}
              class={`text-xs font-sans pb-0.5 transition-colors ${linkClass(false)}`}
            >
              {t('nav.feedback')}
            </button>
            <LanguagePicker tone="onDark" />
          </div>

          {/* Right: mobile menu trigger */}
          <button
            type="button"
            class="sm:hidden flex flex-col justify-center w-8 h-8 gap-1.5 rounded border border-stone-700 text-stone-300 hover:text-white hover:border-stone-500 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen() ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={mobileOpen()}
          >
            <span class="block w-4 h-px bg-current mx-auto" />
            <span class="block w-4 h-px bg-current mx-auto" />
            <span class="block w-4 h-px bg-current mx-auto" />
          </button>
        </div>

        {/* Mirror line under the nav once scrolled — same motif as the landing hero. */}
        <Show when={scrolled()}>
          <div
            class="w-full h-px"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(127,119,221,0.45), transparent)',
            }}
          />
        </Show>
      </nav>

      {/* Mobile sheet */}
      <Show when={mobileOpen()}>
        <div
          class="sm:hidden fixed inset-0 z-40 bg-stone-950/95 backdrop-blur-md pt-16 px-6 flex flex-col gap-4"
          onClick={() => setMobileOpen(false)}
        >
          <a
            href="/roadmap"
            class={`text-lg font-serif pb-1 border-b ${
              isCurrent('/roadmap')
                ? 'text-violet-400 border-violet-500/60'
                : 'text-stone-200 border-stone-800'
            }`}
          >
            {t('nav.roadmap')}
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen(false);
              openFeedback();
            }}
            class="text-left text-lg font-serif text-stone-200 pb-1 border-b border-stone-800"
          >
            {t('nav.feedback')}
          </button>
          <div class="pt-2">
            <LanguagePicker tone="onDark" variant="inline" />
          </div>
        </div>
      </Show>
    </>
  );
};
