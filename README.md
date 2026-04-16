# InkMirror

> **Two hearts, one soul.** — AI-assisted, offline-first novel writing web app.

Live: [inkmirror.peteriadamgabor.workers.dev](https://inkmirror.peteriadamgabor.workers.dev)

---

## What it is

Block-based editor for novel-length manuscripts. Runs entirely in the browser — Solid.js + TypeScript + Vite, persisted to IndexedDB, with in-browser AI (Transformers.js in a Web Worker) for sentiment analysis, character mood, and the Story Pulse ECG. The novel never leaves your machine.

## Documentation

Read in order:

| # | File | Contents |
|---|------|----------|
| 1 | [01-PROJECT-VISION.md](./01-PROJECT-VISION.md) | What the app is, who it's for, philosophy, brand |
| 2 | [02-TECH-STACK.md](./02-TECH-STACK.md) | Full tech stack, every layer |
| 3 | [03-FEATURES.md](./03-FEATURES.md) | Every feature in detail (graveyard, pulse, sonification, AI) |
| 4 | [04-DATA-MODEL.md](./04-DATA-MODEL.md) | TypeScript interfaces, IDB schema |
| 5 | [05-ROADMAP-AND-ADR.md](./05-ROADMAP-AND-ADR.md) | Development phases, architectural decisions |
| 6 | [06-CODING-GUIDELINES.md](./06-CODING-GUIDELINES.md) | Coding rules & conventions |

For AI coding agents: start with [CLAUDE.md](./CLAUDE.md).

## Status

- **Phase 1** — 60 FPS block-based editor (shipped)
- **Phase 2** — Persistence via IndexedDB (shipped)
- **Phase 3** — Local AI: sentiment, ECG, character moods, heatmap, sonification (shipped)

Historical perf/QA notes live in [`docs/archive/`](./docs/archive/).

## Dev

```bash
npm install
npm run dev          # localhost:5173
npm run build        # typecheck + vite build
npm run test         # vitest
npm run test:e2e     # playwright
npm run deploy       # build + wrangler deploy
```

## License

[MIT](./LICENSE)
