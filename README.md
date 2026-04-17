<div align="center">

# InkMirror

**Two hearts, one soul.**
An AI-assisted, offline-first novel writing web app.

[**→ Try it live**](https://inkmirror.peteriadamgabor.workers.dev)

</div>

---

InkMirror is a block-based editor for novel-length manuscripts. It runs entirely in your browser — your writing is stored locally in IndexedDB, analyzed by AI models that execute on-device, and never leaves your machine unless you explicitly export it.

The philosophy: **AI doesn't write for you — it holds a mirror up to you.** InkMirror doesn't generate prose. It analyzes, reflects, and warns. Creativity stays with the writer.

## What it does

### Writing surface

- **Block-based editor** with four types: text, dialogue (speaker-tinted chat bubbles), scene (location / time / mood / cast metadata), note (private, never exported).
- **Six chapter kinds** — standard, cover, dedication, epigraph, acknowledgments, afterword. Each renders the way a reader will see it: cover larger and centered, epigraph italicized and padded, and so on.
- **60 FPS at 100k+ words.** No Layout Reflow. Canvas-based text measurement via [`pretext`](https://www.npmjs.com/package/@chenglou/pretext) + virtualization keeps long novels smooth.
- **Dead Text Graveyard** — every deleted block rests here. Restore any time.
- **Typography system** — six named system-font stacks (Literary, Classical, Crisp, Modern, Sans, Mono), real small-caps + old-style figures where the face supports them, tabular numerals on counters.
- **Focus + zen modes** — hide the chrome when you want to disappear into the prose.

### AI (runs locally)

- **Two-pulse ECG** — writer's pulse (typing rhythm, flow, session time) and story's pulse (sentiment across blocks) side by side.
- **Mood heatmap** — per-chapter sentiment visualized as color, so you can see the emotional shape of a novel at a glance.
- **Character sentiment** — every named character's arc tracked across the manuscript.
- **Auto-detected characters** — names mentioned in prose become clickable cards.
- **Sonification** — via [Tone.js](https://tonejs.github.io/), the mood of the current chapter drives an ambient chord.

### Exports

Six formats: **Markdown, JSON, Fountain, EPUB, DOCX, PDF.** Inline bold / italic travels through. Fountain gets proper `CONT'D` markers. Scene metadata becomes a proper `INT./EXT.` line.

### Backup / sync

- **Per-document bundle** (`.inkmirror.json`) — move a book to another browser or device.
- **Full-database backup** (`.inkmirror.backup.json`) — disaster recovery for everything.
- **Import collision handling** — if a document with the same id already exists, you pick: Replace, Keep both, or Cancel.

### Language

- **System auto-detect** on first load (reads `navigator.language`).
- **English + Magyar** shipped; new languages are one file to copy and translate. Key-by-key parity is enforced by TypeScript.
- **Picker available on every page** — landing, 404, document picker, editor top bar, document settings.

### Other touches

- **PWA** — installable, works offline after first load.
- **Undo / redo** across block deletions and type changes.
- **Branded 404** and boot splash with a breathing mirror reflection.
- **In-app feedback** — reaches a private Discord via a Cloudflare Worker proxy. No manuscript content is ever included.

## Tech stack

- **Solid.js 1** + **TypeScript strict** + **Vite 5** + **Tailwind 3**
- **IndexedDB** (via [`idb`](https://www.npmjs.com/package/idb)) for persistence
- **[Transformers.js](https://huggingface.co/docs/transformers.js)** in a Web Worker for local sentiment analysis (multilingual DistilBERT)
- **[Tone.js](https://tonejs.github.io/)** for sonification
- **Cloudflare Workers** for hosting, HF model-CDN CORS proxy, and the feedback endpoint

## Getting started

```bash
git clone https://github.com/peteriadamgabor/inkmirror.git
cd inkmirror
npm install
npm run dev            # http://localhost:5173
```

Scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + Vite production build |
| `npm run preview` | Local preview via Wrangler (matches prod) |
| `npm test` | Vitest unit suite (143 tests) |
| `npm run test:e2e` | Playwright end-to-end suite |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Architecture at a glance

```
src/
├── engine/    # pretext-backed text measurement, virtualization
├── store/     # Solid.js stores (the UI↔data bridge)
├── db/        # IndexedDB repositories
├── ai/        # AI orchestration (calls workers)
├── workers/   # Web Workers — ai-worker, pulse-tracker
├── audio/     # Tone.js sonification
├── backup/    # export + import for .inkmirror.json bundles
├── i18n/      # language dictionaries + t() helper
├── exporters/ # markdown, json, fountain, epub, docx, pdf
├── ui/        # layout, blocks, features, shared components
└── routes/    # Solid Router routes (editor, landing, 404, perf)
```

Import rule: `ui/` never reaches into `db/` or `ai/` directly — `store/` is the only bridge. Heavy computation (AI inference, keystroke aggregation) always runs in a Web Worker; the main thread stays dedicated to 60 FPS rendering.

## Adding a language

1. Copy `src/i18n/en.ts` → `src/i18n/<code>.ts` (e.g. `fr.ts`).
2. Translate every value. The TypeScript compiler will fail the build if you miss or mistype a key — completeness is enforced.
3. Register it in `src/i18n/index.ts`:

```ts
import { fr } from './fr';
export const LANGUAGES = [
  { code: 'en', label: 'English', messages: en },
  { code: 'hu', label: 'Magyar', messages: hu },
  { code: 'fr', label: 'Français', messages: fr },
];
```

The picker in Document Settings updates automatically. System fonts only — no downloads.

## Privacy

The manuscript lives in IndexedDB, inside your browser profile. AI models are downloaded once from HuggingFace on first use (~60 MB, cached by the browser and the Cloudflare proxy) and then run locally — inference never hits a server. There is no account system, no telemetry, no analytics.

The in-app feedback form sends only what you type, plus the Cloudflare-standard `cf-connecting-ip` + `user-agent` (metadata the server sees anyway). Your manuscript content never leaves your browser without an explicit export.

## License

[MIT](./LICENSE) © Péteri Ádám Gábor
