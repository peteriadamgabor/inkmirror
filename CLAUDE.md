# CLAUDE.md — InkMirror

AI-assisted novel writing webapp. **Two hearts, one soul** — the writer's and the story's pulse. Offline-first, everything runs in the browser.

The numbered docs (`01-...md` → `06-...md`) are the source of truth. If there is a conflict between them and this file, the numbered docs win.

## Reading order at the start of a new session

1. `01-PROJECT-VISION.md` — what we are building and why
2. `02-TECH-STACK.md` — rationale for tech decisions
3. `03-FEATURES.md` — feature details
4. `04-DATA-MODEL.md` — TS interfaces, SurrealDB schema
5. `05-ROADMAP-AND-ADR.md` — **current phase** + architectural decisions
6. `06-CODING-GUIDELINES.md` — coding rules

## Current phase

**Phase 1: Proof of Concept.** Goal: 60 FPS block-based editor with 500+ blocks on the `pretext` + Solid.js stack. Do not build the whole app — only the PoC basics. Later phases (database, AI, audio, SaaS) are opt-in and come later.

## Stack (required)

- **Solid.js 1.x** + **TypeScript strict** + **Vite 5** + **Tailwind 4**
- **pretext** — Canvas/Wasm text measurement (the foundation of virtualization)
- **SurrealDB Wasm** (Phase 2+), **Transformers.js** in a Web Worker (Phase 3+), **Tone.js** (Phase 3-4)
- **FORBIDDEN:** React, Vue, Angular, Next.js, Express, Postgres/Mongo, Firebase, CSS-in-JS, jQuery
- Package manager: **pnpm**

## Non-negotiable rules

1. **Solid.js patterns:** `createSignal` / `createStore` / `createMemo` / `<For>`. Never `Array.map` in JSX. Granular `setState('blocks', id, 'content', ...)` — don't overwrite the entire store.
2. **`any` is forbidden.** Discriminated unions for block metadata.
3. **Performance above all.** Nicer but slower solution → pick the faster one. `requestAnimationFrame` for scrolling, `debounce` for pretext measurements, Web Worker for every heavy computation (AI, sentiment, keystroke aggregation). Synchronous blocking on the main thread is FORBIDDEN.
4. **`pretext` wrapper:** measurement is hidden behind `src/engine/measure.ts` so it can be swapped out if the API changes (Fallback: Canvas `measureText()` or off-screen DOM).
5. **Always soft-delete.** Blocks are deleted with a `deleted_at` field — because of the Dead Text Graveyard feature nothing should be lost. `deleted_from` is also required (where it was deleted from).
6. **`contenteditable` is TEMPORARY.** Don't build complex logic on it, it will be replaced in Phase 2-3.

## Layering (import rule)

```
ui/ → store/ → db/
ui/ → store/ → ai/  (via workers)
ui/ → engine/       (pretext measurement)
```

`ui/` NEVER imports directly from `db/` or `ai/`. `store/` is the bridge.

## File organization

```
src/
├── types/       # only TS types, zero logic
├── engine/      # pretext, virtualization — UI-independent
├── store/       # Solid.js stores
├── db/          # SurrealDB (Phase 2+)
├── ai/          # AI logic (Phase 3+)
├── audio/       # Tone.js (Phase 3-4)
├── ui/
│   ├── layout/  # App, Sidebar, Editor, RightPanel
│   ├── blocks/  # BlockView + per-type components
│   ├── features/# Graveyard, HeatMap, Pulse, Timeline
│   └── shared/  # Button, Tooltip, CommandPalette
├── workers/     # Web Worker files
└── utils/       # pure utility functions
```

**Naming:** component = `PascalCase.tsx`, module/type = `kebab-case.ts`, interface/type = `PascalCase`, function/signal = `camelCase`, constant = `SCREAMING_SNAKE`.

## Design tokens (Tailwind)

- Background: `bg-stone-100 dark:bg-stone-900`
- Floating island: `bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700`
- **Editor text: `font-serif`** (literary feel). UI: `font-sans` (system).
- Writer color: `violet-500` (#7F77DD). Story color: `orange-600` (#D85A30).
- Block labels: text=violet-500, dialogue=teal-600, scene=orange-600, note=stone-400.
- **Dark mode support required** on every component.

## Block types

`text` · `dialogue` (metadata: `speaker`) · `scene` (metadata: `location`, `time`, `characters[]`, `mood`) · `note` (not exported).

## Philosophy (keep this in mind on every decision)

- **"AI doesn't write for you — it holds a mirror up to you."** Not generative. It analyzes, reflects, warns.
- **The novel never leaves the browser** without permission. Sync is opt-in and E2E encrypted.
- **"Two hearts, one soul"** is not marketing — it is architecture. Measure every feature by whether it serves the writer↔story connection.

## Git / commit

Format: `<type>(<scope>): <description>`.
Types: `feat` `fix` `perf` `refactor` `style` `docs` `test` `chore`.
Scope: `engine` `ui` `store` `db` `ai` `audio`.
Example: `feat(engine): pretext measurement integration`.

## If you get stuck

Ask, don't guess — code written on wrong assumptions is more expensive than a clarifying question.
