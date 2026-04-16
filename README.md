<div align="center">

# InkMirror

**Two hearts, one soul.**
An AI-assisted, offline-first novel writing web app.

[**→ Try it live**](https://inkmirror.peteriadamgabor.workers.dev)

</div>

---

InkMirror is a block-based editor for novel-length manuscripts. It runs entirely in your browser — your writing is stored locally in IndexedDB, analyzed by AI models that execute on-device, and never leaves your machine unless you explicitly export it.

The philosophy: **AI doesn't write for you — it holds a mirror up to you.** InkMirror doesn't generate prose. It analyzes, reflects, and warns. Creativity stays with the writer.

## What makes it different

- **Two-pulse ECG** — a dual heartbeat visualization: the *writer's pulse* (typing rhythm, flow states) and the *story's pulse* (tension, emotional cadence, sentence rhythm) side by side.
- **Mood heatmap** — per-chapter sentiment visualized as color, so you can see the emotional shape of a novel at a glance.
- **Character sentiment** — every named character's arc tracked across the manuscript. Dialogue is tinted by speaker.
- **Dead Text Graveyard** — nothing is ever truly deleted. Cut passages are preserved as a creative journal you can mine later.
- **Text sonification** — the rhythm of your prose rendered as sound via Tone.js. Hear the pacing of a paragraph.
- **60 FPS at 100k+ words** — no Layout Reflow. Canvas-based text measurement (via [`pretext`](https://www.npmjs.com/package/@chenglou/pretext)) + virtualization keeps long novels smooth.
- **Offline-first** — the novel never leaves your browser without permission. No accounts, no sync, no server-side data.
- **PWA** — installable, works offline after first load.

## Tech stack

- **Solid.js** + **TypeScript (strict)** + **Vite** + **Tailwind**
- **IndexedDB** (via [`idb`](https://www.npmjs.com/package/idb)) for persistence
- **[Transformers.js](https://huggingface.co/docs/transformers.js)** in a Web Worker for local sentiment analysis (multilingual DistilBERT)
- **[Tone.js](https://tonejs.github.io/)** for sonification
- **Cloudflare Workers** for hosting + an HF model-CDN CORS proxy

## Getting started

```bash
git clone https://github.com/peteriadamgabor/inkmirror.git
cd inkmirror
npm install
npm run dev            # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + Vite production build |
| `npm run preview` | Local preview via Wrangler (matches prod) |
| `npm test` | Vitest unit suite |
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
├── ui/        # layout, blocks, features, shared components
└── routes/    # Solid Router routes
```

Import rule: `ui/` never reaches into `db/` or `ai/` directly — `store/` is the only bridge. Heavy computation (AI inference, keystroke aggregation) always runs in a Web Worker; the main thread stays dedicated to 60 FPS rendering.

## Privacy

The manuscript lives in IndexedDB, inside your browser profile. AI models are downloaded once from HuggingFace on first use (~60 MB, cached by the browser and the Cloudflare proxy) and then run locally — inference never hits a server. There is no account system, no telemetry, no analytics.

## License

[MIT](./LICENSE) © Péteri Ádám Gábor
