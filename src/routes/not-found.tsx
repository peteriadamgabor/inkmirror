export const NotFoundRoute = () => {
  return (
    <div class="min-h-screen w-full bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 flex items-center justify-center px-6">
      <div class="w-[460px] max-w-[92vw] text-center">
        <div class="relative mb-4">
          <div class="font-serif text-[96px] leading-none tracking-tight text-violet-500">
            404
          </div>
          <div
            class="font-serif text-[96px] leading-none tracking-tight select-none pointer-events-none text-violet-300 inkmirror-mirror-breath"
            style={{
              'mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 80%)',
              '-webkit-mask-image':
                'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 80%)',
              'margin-top': '-4px',
              filter: 'blur(0.5px)',
            }}
            aria-hidden="true"
          >
            404
          </div>
        </div>

        <div class="font-serif text-xl text-stone-800 dark:text-stone-100 mb-2">
          This page isn't in the manuscript.
        </div>
        <div class="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
          The URL you followed doesn't match any page InkMirror knows about.
          No work was lost — your manuscripts are safe in this browser.
        </div>

        <div class="flex items-center justify-center gap-2 flex-wrap">
          <a
            href="/landing"
            class="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            Landing page
          </a>
          <a
            href="/"
            class="px-4 py-2 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
          >
            Open InkMirror
          </a>
        </div>
      </div>
    </div>
  );
};
