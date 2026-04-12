# StoryForge — Coding Guidelines & AI Agent Instructions

> This file is for AI coding agents. If you are an AI agent, read it carefully before writing anything.

---

## Project Context

Read these files in this order before you code:
1. `01-PROJECT-VISION.md` — What this app is and who it's for
2. `02-TECH-STACK.md` — Which technologies we use and why
3. `03-FEATURES.md` — Detailed description of every feature
4. `04-DATA-MODEL.md` — TypeScript interfaces and data structure
5. `05-ROADMAP-AND-ADR.md` — The current phase and architectural decisions

---

## Forbidden Technologies

DO NOT use these under any circumstances:

| Forbidden | Use instead | Why |
|-----------|-------------|-----|
| React | Solid.js | Virtual DOM overhead unacceptable |
| Vue | Solid.js | Same |
| Angular | Solid.js | Same |
| Next.js / Nuxt | Vite + Solid.js | No SSR needed, offline-first app |
| Express / Fastify | Cloudflare Workers | No traditional backend |
| PostgreSQL / MySQL | SurrealDB Wasm | Everything runs in the browser |
| MongoDB | SurrealDB Wasm | Same |
| Firebase | SurrealDB + IndexedDB | Vendor lock-in + not offline-first |
| Styled Components / CSS-in-JS | Tailwind CSS | Runtime overhead |
| jQuery | Native JS + Solid.js | Unnecessary abstraction |

---

## Required Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Solid.js | 1.x | UI framework |
| TypeScript | 5.x, strict mode | Type safety |
| Vite | 5.x+ | Build tool |
| Tailwind CSS | 4.x | Styling |
| pretext | latest | Text measurement (Canvas/Wasm) |
| SurrealDB Wasm | latest | Database (Phase 2+) |
| Transformers.js | latest | Local AI (Phase 3+) |
| Tone.js | latest | Text sonification (Phase 3+) |

---

## Coding Rules

### 1. TypeScript Strictness

```typescript
// REQUIRED: strict mode
// tsconfig.json: "strict": true

// GOOD: explicit types on interfaces
function getBlock(id: UUID): Block | undefined { ... }

// BAD: any type
function getBlock(id: any): any { ... }  // NEVER

// GOOD: discriminated union for block metadata
if (block.metadata.type === 'dialogue') {
  const speaker = block.metadata.data.speaker_name; // TS knows the type
}
```

### 2. Solid.js Patterns

```typescript
// GOOD: createSignal for simple state
const [sidebarOpen, setSidebarOpen] = createSignal(true);

// GOOD: createStore for complex, nested state
const [state, setState] = createStore<AppState>({ ... });

// GOOD: granular update — only the changed part is updated
setState('blocks', blockId, 'content', newContent);

// BAD: overwriting the entire store
setState({ ...state, blocks: { ...state.blocks, [blockId]: { ...block, content: newContent } } });

// GOOD: createMemo for derived values
const wordCount = createMemo(() => 
  Object.values(state.blocks)
    .filter(b => b.chapter_id === activeChapterId() && !b.deleted_at)
    .reduce((sum, b) => sum + b.content.split(/\s+/).length, 0)
);

// GOOD: For component for lists (not Index, not map)
<For each={sortedBlocks()}>
  {(block) => <BlockView block={block} />}
</For>

// BAD: Array.map in JSX (not reactive)
{blocks.map(b => <BlockView block={b} />)}
```

### 3. Performance Rules

```typescript
// REQUIRED: requestAnimationFrame for scroll events
let ticking = false;
editor.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateVisibleBlocks();
      ticking = false;
    });
    ticking = true;
  }
});

// REQUIRED: debounce pretext measurements
const debouncedMeasure = debounce((blockId: UUID) => {
  const measurement = measureBlock(blockId);
  setState('measurements', blockId, measurement);
}, 100);

// REQUIRED: Web Worker for heavy computation
// AI analysis, sentiment analysis, keystroke aggregation
// MUST NEVER run on the main thread.
const worker = new Worker('./workers/ai-worker.ts', { type: 'module' });

// FORBIDDEN: synchronous operations on the main thread
// Never block — async/await everywhere
```

### 4. Tailwind CSS Conventions

```html
<!-- Floating island panel -->
<div class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4">

<!-- Block type label -->
<span class="text-[10px] uppercase tracking-wider font-medium text-violet-500">Text</span>

<!-- Editor text (serif!) -->
<div class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100">

<!-- Floating toolbar -->
<div class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 
            px-4 py-2 flex items-center gap-4 w-fit mx-auto">
```

**Rules:**
- Always support dark mode (`dark:` prefix)
- Editor text is always `font-serif`
- UI elements are always `font-sans` (system default)
- Floating islands: `bg-white rounded-2xl border border-stone-200`
- Background: `bg-stone-100 dark:bg-stone-900`

### 5. File Organization

```
src/
├── types/           # ONLY TypeScript types, zero logic
├── engine/          # Text engine (pretext, virtualization) — UI-independent
├── store/           # Solid.js stores — app state
├── db/              # SurrealDB connection and queries
├── ai/              # AI logic — Web Workers
├── audio/           # Tone.js text sonification
├── ui/              # Solid.js components — ONLY display
│   ├── layout/      # App, Sidebar, Editor, RightPanel
│   ├── blocks/      # BlockView, TextBlock, DialogueBlock, etc.
│   ├── features/    # Graveyard, HeatMap, Pulse, Timeline
│   └── shared/      # Button, Tooltip, CommandPalette
├── workers/         # Web Worker files
├── utils/           # Pure utility functions
├── index.tsx
└── index.css
```

**Rule:** Components in `ui/` NEVER import directly from `db/` or `ai/`. Communication happens through `store/`.

```
ui/ → store/ → db/
ui/ → store/ → ai/ (via workers)
ui/ → engine/ (pretext measurement)
```

### 6. Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| File (component) | PascalCase | `BlockView.tsx` |
| File (module) | kebab-case | `pulse-tracker.ts` |
| File (type) | kebab-case | `block.ts` |
| Interface | PascalCase | `Block`, `Chapter` |
| Type alias | PascalCase | `BlockType`, `UUID` |
| Signal | camelCase | `const [sidebarOpen, setSidebarOpen]` |
| Store | camelCase | `const [state, setState]` |
| Function | camelCase | `measureBlock()`, `getActiveBlocks()` |
| Constant | SCREAMING_SNAKE | `MOOD_COLORS`, `MAX_BLOCKS_VISIBLE` |
| CSS class | Tailwind utility | `bg-white rounded-2xl` |

### 7. Comment Rules

```typescript
// GOOD: short, useful comment that explains the WHY
// pretext cannot measure an empty string, so a fallback height is needed
const height = content.length === 0 ? DEFAULT_BLOCK_HEIGHT : measure(content);

// BAD: unnecessary comment that repeats the WHAT
// Set the height
const height = measure(content);

// GOOD: TODO for future work with a phase reference
// TODO(Phase 3): integrate AI sentiment analysis here

// GOOD: HACK marker when a workaround is needed
// HACK: contenteditable loses cursor position after resize
// Will be replaced with custom input handling in Phase 2
```

---

## Git Conventions

### Commit Message Format
```
<type>(<scope>): <description>

Types: feat, fix, perf, refactor, style, docs, test, chore
Scope: engine, ui, store, db, ai, audio

Examples:
feat(engine): pretext measurement integration
fix(ui): block rendering in dark mode
perf(engine): increase virtualization buffer
refactor(store): reorganize block CRUD
```

### Branch Strategy
```
main              ← stable, deployable
├── develop       ← main development branch
│   ├── feat/block-editor
│   ├── feat/graveyard
│   └── fix/scroll-performance
```

---

## Important Notes for AI Agents

1. **Do not write the whole app at once.** Phase 1 is the PoC — only the basics are needed.

2. **The `pretext` API may change.** If you don't know the exact API, write a wrapper module (`src/engine/measure.ts`) with a stable interface and note that the internal implementation depends on the `pretext` version.

3. **`contenteditable` is TEMPORARY.** Do not build complex logic on top of it. It will be replaced in Phase 2-3.

4. **Performance above all.** If a solution gives nicer code but is slower — choose the faster one.

5. **"Two hearts, one soul" is not marketing copy.** It is the foundation of the app's architecture. Measure every feature by whether it serves the connection between the writer and the story.

6. **Ask if anything is unclear.** Better to ask for context than to code on wrong assumptions.
