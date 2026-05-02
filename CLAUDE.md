# CLAUDE.md — InkMirror

AI-assisted novel writing webapp. **Two hearts, one soul** — the writer's and the story's pulse. Offline-first, everything runs in the browser.

Production: https://inkmirror.cc
Repo: https://github.com/peteriadamgabor/inkmirror

This file plus the README are the source of truth. Older numbered design docs (`01-...md` → `06-...md`) predate the SurrealDB pivot and the bulk of shipped work; if you find them in `docs/archive/` on a local clone, treat them as historical context only.

## Shipped state (current)

InkMirror is past PoC. Editor, persistence, AI, sonification, exports, backup, i18n, and feedback are all live. The app is deployed to Cloudflare Workers with HuggingFace model downloads proxied through the same Worker for CORS.

What's shipped:
- Block-based editor with four block types and six chapter kinds (standard, cover, dedication, epigraph, acknowledgments, afterword)
- IndexedDB persistence via `idb`, schema v5 with block revisions
- AI sentiment analysis via Transformers.js in a Web Worker — Story Pulse ECG, mood heatmap, per-character sentiment
- Ambient sonification via Tone.js
- Six export formats: Markdown, JSON, Fountain, EPUB, DOCX, PDF
- Backup / restore: per-document bundles + full-DB dumps, with collision handling (Replace / Keep both / Cancel)
- i18n: English + Magyar, auto-detected from `navigator.language`, one-file-to-add-a-language
- In-app feedback form → Cloudflare Worker → Discord webhook
- PWA, undo/redo, Dead Text Graveyard, Plot Timeline, Hotkeys editor, Command Palette
- Premium UI layer: design tokens (elevation, borders), typography system, motion pack (block enter, ECG draw-in, modal scale-fade, mirror breath), quiet-by-default chrome
- Public surface (`/landing`, `/roadmap`, `/privacy`, `/not-found`) recrafted on the editor's light-cream vocabulary in v0.7.0 — numbered literary list, editorial stanzas, hairline rules; sun/moon theme toggle in `SiteNav` via `useTheme()` so visitors flip light↔dark without entering the editor (v0.7.1)

## Stack (required)

- **Solid.js 1** + **TypeScript strict** + **Vite 8** + **Tailwind 3**
- **[`pretext`](https://www.npmjs.com/package/@chenglou/pretext)** — Canvas/Wasm text measurement (wrapped by `src/engine/measure.ts`, which can swap it out if the API changes)
- **[`idb`](https://www.npmjs.com/package/idb)** for IndexedDB (we pivoted away from SurrealDB Wasm — there's an upstream bug that made it unreliable)
- **Transformers.js** in a Web Worker for sentiment analysis (model: `Xenova/distilbert-base-multilingual-cased-sentiments-student`)
- **Tone.js** for sonification
- **Cloudflare Workers** for hosting + the HF CORS proxy + the `/feedback` Discord forwarder
- **libsodium** is **not** in the bundle yet — E2E encryption is designed but not shipped
- Package manager: **npm** (lockfile is `package-lock.json`)
- **FORBIDDEN:** React, Vue, Angular, Next.js, Express, Postgres/Mongo, Firebase, CSS-in-JS, jQuery

## Non-negotiable rules

1. **Solid.js patterns:** `createSignal` / `createStore` / `createMemo` / `<For>`. Never `Array.map` in JSX. Granular `setState('blocks', id, 'content', ...)` — don't overwrite the entire store.
2. **`any` is forbidden.** Discriminated unions for block metadata.
3. **Performance above all.** Nicer-but-slower → pick the faster one. `requestAnimationFrame` for scrolling, `debounce` for pretext measurements, Web Worker for every heavy computation (AI, sentiment, keystroke aggregation). Synchronous blocking on the main thread is FORBIDDEN.
4. **`pretext` wrapper:** measurement is hidden behind `src/engine/measure.ts`. Fallback: Canvas `measureText()` or off-screen DOM.
5. **Always soft-delete.** Blocks are deleted with a `deleted_at` field — because of the Dead Text Graveyard feature nothing should be lost. `deleted_from` is also required (where it was deleted from).
6. **`contenteditable` stays for now.** It's imperfect but has carried us through editor, marks, undo, speaker detection, and sonification without major pain. Only replace with a heavier solution when you hit a concrete wall.
7. **Every user-facing string routes through `t()`** from `src/i18n`. Don't hardcode English in JSX — the compiler won't catch it, but the app will ship a half-translated UI.
8. **Respect `prefers-reduced-motion`.** Every `@keyframes` in `src/index.css` has a matching `@media (prefers-reduced-motion: reduce)` override.

## Layering (import rule)

```
ui/ → store/ → db/
ui/ → store/ → ai/      (via workers)
ui/ → engine/           (pretext measurement)
ui/ → backup/           (bundles)
ui/ → i18n/             (translation helper)
ui/ → exporters/        (output formats)
```

`ui/` NEVER imports directly from `db/` or `ai/`. `store/` is the bridge.

## File organization

```
src/
├── types/       # only TS types, zero logic
├── engine/      # pretext, virtualization — UI-independent
├── store/       # Solid.js stores
├── db/          # IndexedDB repositories + connection
├── ai/          # AI orchestration (talks to workers/ai-worker.ts)
├── audio/       # Tone.js sonification
├── backup/      # export / import for .inkmirror.json bundles
├── i18n/        # en.ts + hu.ts dictionaries + t() helper
├── exporters/   # markdown, json, fountain, epub, docx, pdf
├── ui/
│   ├── layout/  # App, Sidebar, Editor, RightPanel, DocumentPicker, BootSplash
│   ├── blocks/  # BlockView + SceneMetadataEditor + BlockHistory + keybindings
│   ├── features/# Graveyard, MoodHeatmap, PulseDashboard, StoryPulseEcg, PlotTimeline,
│   │              WordCount, CharacterSentiment, CommandPalette, HotkeysModal,
│   │              BlockTypesHelp, ChapterTypesHelp, DocumentSettings
│   └── shared/  # ConfirmHost, ToastHost, ContextMenuHost, FeedbackHost,
│                  LanguagePicker, CrashBoundary, confirm, toast, feedback, icons
├── workers/     # ai-worker, pulse-worker + their client wrappers
├── routes/      # editor, landing, not-found, perf-harness
├── utils/       # pure utility functions
├── index.css    # Tailwind + tokens + keyframes + reduced-motion guards
├── index.tsx    # boot + router + 404 catch-all
└── worker.ts    # Cloudflare Worker entry (hf-proxy + /feedback + asset fallback)
```

**Naming:** component = `PascalCase.tsx`, module/type = `kebab-case.ts`, interface/type = `PascalCase`, function/signal = `camelCase`, constant = `SCREAMING_SNAKE`.

## Design tokens

Defined in `src/index.css` under `:root` + `.dark`:

- `--elev-1` / `--elev-2` / `--elev-3` — three-tier soft-shadow scale
- `--border-rest` / `--border-active` / `--border-modal` — border weights
- `.inkmirror-smallcaps` — real OpenType small-caps with uppercase fallback
- `.tabular-nums` / `font-mono` — tabular numerals on every counter
- `.inkmirror-paper` — subtle SVG grain on the editor scroll surface
- Dark mode carries a faint violet undertone (`#1a1723` instead of stone-900)

Tailwind still drives most styling; tokens are the unified "vocabulary" the rest of the app reaches for when a raw utility isn't enough.

### Brand

- Background: `bg-stone-100 dark:bg-stone-900` (both warm-shifted via CSS)
- Floating island: `bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700`
- **Editor text: `font-serif`** (literary feel). UI: `font-sans` (system). User-selectable via Document Settings → Typeface.
- Writer color: `violet-500` (#7F77DD). Story color: `orange-600` (#D85A30).
- Block labels: text=violet-500, dialogue=teal-600, scene=orange-600, note=stone-400.
- **Dark mode support required** on every component.

## Block types

`text` · `dialogue` (metadata: `speaker_id`, optional `parenthetical`) · `scene` (metadata: `location`, `time`, `character_ids[]`, `mood`) · `note` (not exported). All share the same 12px radius + full-column-width container. Dialogue keeps its identity via speaker-colored tint + speaker pill + POV header alignment, not a narrower column.

## Chapter kinds

`standard` · `cover` · `dedication` · `epigraph` · `acknowledgments` · `afterword`. Non-standard kinds hide block chrome, center the text, and export as front- or back-matter in the right position.

## i18n

Everything user-facing goes through `t()`:

```ts
import { t } from '@/i18n';
<button title={t('block.openMenu')}>…</button>
t('picker.updatedAgo', { ago: '2m' })
```

`src/i18n/en.ts` is the source of truth. `src/i18n/hu.ts` is the translation. `Messages` type is `DeepStringify<typeof en>`, which forces hu.ts to mirror en.ts key-by-key — miss a key and the build fails. Current language is a Solid signal, so any component calling `t()` re-renders when the picker changes. Persisted to `localStorage['inkmirror.lang']`, auto-detected from `navigator.language` on first load.

To add a language: copy `en.ts`, translate, register in `LANGUAGES` in `src/i18n/index.ts`. The picker updates automatically.

## Backup / restore

Two bundle formats in `src/backup/format.ts`:
- `.inkmirror.json` — one document + its chapters + blocks (including graveyard) + characters + sentiments. Skips `block_revisions` (undo history — ephemeral, ~20× the block count in size).
- `.inkmirror.backup.json` — raw dump of every object store.

Import remaps IDs on collision when strategy is `'copy'`, and also rewrites every FK (dialogue `speaker_id`, scene `character_ids`, `pov_character_id`, `deleted_from.chapter_id` on graveyard blocks). Strategy `'replace'` wipes the existing doc's rows first. Full-DB restore is skip-if-exists.

## Feedback

Worker route `/feedback` in `src/worker.ts` forwards POSTs to `env.DISCORD_WEBHOOK` (configured as a runtime Secret, not a build var). Server-side it enforces: empty-message reject, 4000-char cap on message, 200-char cap on contact, honeypot field, min-2s render-to-submit gate. No feedback content is persisted on our side — Discord is the storage.

## Philosophy (keep this in mind on every decision)

- **"AI doesn't write for you — it holds a mirror up to you."** Not generative. It analyzes, reflects, warns.
- **The novel never leaves the browser** without permission. Sync is opt-in and (when it arrives) E2E encrypted.
- **"Two hearts, one soul"** is not marketing — it is architecture. Measure every feature by whether it serves the writer↔story connection.

## Git / commit

Format: `<type>(<scope>): <description>`.
Types: `feat` `fix` `perf` `refactor` `style` `docs` `test` `chore`.
Scope: `engine` · `ui` · `store` · `db` · `ai` · `audio` · `backup` · `i18n` · `exporters` · `dev`.
Example: `feat(i18n): system-lang auto-detect with English fallback`.

## Releasing to master

**Before pushing to `master` (production):**

1. Bump `version` in `package.json` (semver — patch for fixes, minor for features, major for breaking).
2. Add a new entry to the top of both `en` and `hu` arrays in `src/i18n/whats-new.ts` with:
   - `id` set to today's date (`YYYY-MM-DD`) — must match across locales.
   - `title` that includes the new version (`v0.2.0 — …`).
   - `items[]` covering what users will notice (skip pure refactors / chores).
3. Commit those two changes together with the release: `chore(release): v0.2.0`.

The build identity (`__APP_COMMIT__`, `__APP_BUILT_AT__`) updates automatically on every Cloudflare build and shows in the modal footer. The version + changelog id are the things that drive the user-facing badge — auto-build SHAs do not, by design (otherwise every minor deploy would nag every user).

## If you get stuck

Ask, don't guess — code written on wrong assumptions is more expensive than a clarifying question.

## Design context (PRODUCT.md / DESIGN.md)

Two project-root files carry the design contract for AI agents and the [`impeccable`](https://github.com/pbakaus/impeccable) skill:

- **`PRODUCT.md`** — strategic: register (`product`), users, purpose, brand personality (*intimate, literary, observant*), anti-references, design principles (mirror not pen, two hearts one soul, quiet by default, premium craft, novel-stays-local), accessibility (WCAG AA + colorblind-safe + reduced-motion).
- **`DESIGN.md`** — visual system: tokens, typography, elevation, components, do's/don'ts. Generated from `src/index.css` + Tailwind config. Refresh via `/impeccable document` when the visual system drifts.

These supplement, never replace, the rules above. If they conflict, this file wins.
