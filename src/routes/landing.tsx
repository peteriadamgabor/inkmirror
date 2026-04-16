import { For } from 'solid-js';

const FEATURES = [
  {
    title: 'Chat-style dialogue',
    desc: 'Colored bubbles per speaker, live auto-detect from "Name: Hello", POV alignment like iMessage. Tab cycles through your cast.',
    accent: 'text-teal-500',
  },
  {
    title: 'Story Pulse',
    desc: 'AI-powered sentiment analysis runs locally in your browser. See your story\'s emotional arc in a real-time ECG, mood heatmap, and per-character mood tracker.',
    accent: 'text-emerald-500',
  },
  {
    title: '6 export formats',
    desc: 'Markdown, JSON, Fountain, EPUB, DOCX, PDF — one click each. Bold and italic carry through. Fountain gets CONT\'D markers automatically.',
    accent: 'text-orange-500',
  },
  {
    title: 'Nothing is lost',
    desc: 'Every deleted block goes to the Dead Text Graveyard. Every edit is tracked in a per-block revision history. Undo with Ctrl+Z across block deletions and type changes.',
    accent: 'text-violet-500',
  },
  {
    title: 'Offline & private',
    desc: 'Your novel never leaves your browser. No server, no account, no telemetry. Installable as a PWA. AI runs locally via Transformers.js — not even the sentiment model phones home.',
    accent: 'text-rose-500',
  },
  {
    title: 'Built for focus',
    desc: 'Focus mode hides everything but the writing. Zen mode strips even the block chrome. Ambient sonification maps your chapter\'s mood to a generative chord.',
    accent: 'text-sky-500',
  },
];

const MORE = [
  'Block-based editor with 60 FPS virtualization at 100k+ words',
  'Scene blocks with location, time, mood, and cast metadata',
  'Plot timeline view across all chapters',
  'Character cards with auto-detection and Unicode-aware matching',
  'Book page types: Cover, Dedication, Epigraph, Acknowledgments, Afterword',
  'Drag-and-drop block reordering with drop indicator',
  'Inline bold/italic (Cmd+B / Cmd+I) stored as offset-based marks',
  'Global rebindable hotkeys with F1 settings and clash-swap',
  'Command palette (Cmd+K) with fuzzy search across every action',
  'Per-block word count with dialogue vs narration breakdown and reading time',
  'Writer pulse dashboard with WPM, burst rate, and session tracking',
  'Smart paste splits multi-paragraph clipboard into blocks',
  'Custom confirm modals and toast notifications',
  'Multi-document support with a landing picker',
  'Warm sepia light theme and full dark mode',
  'Debug telemetry overlay for development',
];

export const LandingRoute = () => (
  <div class="bg-stone-950 text-stone-100 font-sans scroll-smooth">
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
            class="w-32 h-px mx-auto my-1"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(127,119,221,0.4), transparent)',
            }}
          />
          {/* Mirror reflection */}
          <div
            class="font-serif text-5xl md:text-7xl tracking-tight select-none pointer-events-none"
            style={{
              transform: 'scaleY(-1)',
              'mask-image': 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 60%)',
              '-webkit-mask-image': 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 60%)',
              opacity: '0.3',
              'margin-top': '-0.15em',
              'line-height': '1',
            }}
            aria-hidden="true"
          >
            InkMirror
          </div>
        </div>
        <p class="text-xl md:text-2xl text-stone-400 leading-relaxed mb-3">
          Two hearts, one soul —<br />
          the writer's and the story's pulse.
        </p>
        <p class="text-base text-stone-500 max-w-lg mx-auto mb-10">
          An AI-assisted novel writing app that runs entirely in your browser.
          Offline-first, privacy-first. The AI doesn't write for you — it holds
          a mirror up to you.
        </p>
        <a
          href="/"
          class="inline-block px-8 py-3 rounded-xl bg-violet-500 text-white text-lg font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
        >
          Start writing
        </a>
        <p class="mt-4 text-xs text-stone-600">
          Free. No account. No install. Works in any modern browser.
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
          Everything a writer needs
        </h2>
        <p class="text-stone-500 text-center mb-16 max-w-xl mx-auto">
          Not a stripped-down notes app. Not bloated enterprise software.
          A real tool built by someone who writes.
        </p>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <For each={FEATURES}>
            {(f) => (
              <div class="rounded-2xl border border-stone-800 bg-stone-900/50 p-6 hover:border-stone-700 transition-colors">
                <div class={`text-sm font-medium mb-2 ${f.accent}`}>
                  {f.title}
                </div>
                <p class="text-sm text-stone-400 leading-relaxed">
                  {f.desc}
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
          "AI doesn't write for you"
        </h2>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          InkMirror will never generate text, autocomplete your sentences, or
          suggest plot twists. That's your job — and the world doesn't need
          another tool that does it worse than you.
        </p>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          Instead, the AI <em class="text-stone-200">analyzes</em>. It reads
          your prose and tells you how it <em class="text-stone-200">feels</em>
          — the sentiment, the pacing, the tension curve. It tracks your
          characters across scenes and flags when their descriptions
          contradict. It measures your writing rhythm and shows you when
          you're in flow.
        </p>
        <p class="text-lg text-stone-300 font-serif italic">
          Two hearts, one soul. The writer creates. The story speaks back.
        </p>
      </div>
    </section>

    {/* --- Privacy --- */}
    <section class="py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="font-serif text-3xl md:text-4xl mb-6">
          Your novel never leaves your browser
        </h2>
        <p class="text-lg text-stone-400 leading-relaxed mb-8">
          Everything runs locally. Your text is stored in IndexedDB — not on a
          server, not in the cloud, not anywhere that isn't your machine. The
          AI model downloads once and runs in a Web Worker. The app is
          installable as a PWA and works fully offline.
        </p>
        <div class="grid md:grid-cols-3 gap-6 mt-12">
          <div class="text-center">
            <div class="text-2xl mb-2">🔒</div>
            <div class="text-sm font-medium text-stone-200 mb-1">Zero telemetry</div>
            <div class="text-xs text-stone-500">No analytics, no tracking, no server calls</div>
          </div>
          <div class="text-center">
            <div class="text-2xl mb-2">✈️</div>
            <div class="text-sm font-medium text-stone-200 mb-1">Works offline</div>
            <div class="text-xs text-stone-500">PWA with service worker caching</div>
          </div>
          <div class="text-center">
            <div class="text-2xl mb-2">📦</div>
            <div class="text-sm font-medium text-stone-200 mb-1">Export anytime</div>
            <div class="text-xs text-stone-500">EPUB, DOCX, PDF, Markdown, JSON, Fountain</div>
          </div>
        </div>
      </div>
    </section>

    {/* --- Everything else --- */}
    <section class="py-24 px-6 bg-stone-900/30">
      <div class="max-w-4xl mx-auto">
        <h2 class="font-serif text-3xl md:text-4xl text-center mb-12">
          And also…
        </h2>
        <div class="grid md:grid-cols-2 gap-x-8 gap-y-3">
          <For each={MORE}>
            {(item) => (
              <div class="flex items-start gap-2 text-sm text-stone-400">
                <span class="text-violet-500 mt-0.5 shrink-0">·</span>
                <span>{item}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>

    {/* --- CTA --- */}
    <section class="py-32 px-6 text-center">
      <h2 class="font-serif text-4xl md:text-5xl mb-4">
        Ready to write?
      </h2>
      <p class="text-stone-500 mb-10 text-lg">
        No sign-up. No download. Just open and start.
      </p>
      <a
        href="/"
        class="inline-block px-10 py-4 rounded-xl bg-violet-500 text-white text-xl font-medium hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25"
      >
        Open InkMirror
      </a>
    </section>

    {/* --- Footer --- */}
    <footer class="py-8 px-6 border-t border-stone-800 text-center text-xs text-stone-600">
      InkMirror · Offline-first novel writing · Built with Solid.js + Tailwind
    </footer>
  </div>
);
