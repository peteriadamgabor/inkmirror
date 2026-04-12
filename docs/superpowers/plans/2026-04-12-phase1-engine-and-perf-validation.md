# Phase 1 Plan 1: Engine & Perf Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine layer (`measure.ts`, `virtualizer.ts`, `synthetic.ts`), a read-only virtualized `/perf` route, and record a first FPS measurement on a synthetic 500-block document. Exit criterion: a documented FPS number that answers whether the `pretext` + Solid.js virtualization bet works.

**Architecture:** Solid.js SPA scaffolded with Vite. Pure functional engine layer (unit-tested with Vitest) decoupled from UI. A `/perf` route loads a seeded synthetic document through the real store and real `Editor` component — if the harness is fast, the app will be fast. No contenteditable, no persistence, no real editing in this plan.

**Tech Stack:** Solid.js 1.x, TypeScript strict mode, Vite 5, Tailwind CSS 4, `@solidjs/router`, Vitest, `pretext` (experimental — API is researched at implementation time), pnpm.

---

## Scope of this plan (weeks 1–2 of the spec)

**In scope:**
- Project scaffolding with all required dev tooling
- Base TypeScript types (`Block`, `Chapter`, `Document`, `BlockMetadata`, `UUID`)
- `engine/measure.ts` with `pretext` backend + memoization + a documented fallback interface
- `engine/virtualizer.ts` (pure function, fully unit-tested)
- `engine/synthetic.ts` (seeded PRNG generator)
- Solid.js store (`store/document.ts`)
- Floating-island layout (`App`, `Sidebar` stub, `Editor`, `RightPanel` stub)
- Read-only `BlockView` (just renders block content — no contenteditable yet)
- `FpsOverlay` dev-only component
- `/perf` route wired end-to-end
- First FPS measurement documented in `docs/perf-phase1.md`

**Out of scope for this plan (belongs to Plan 2):**
- Contenteditable and any editing
- Keybindings (Enter / Backspace-merge / arrow navigation)
- IME / composition handling
- Paste handling
- Anything in the spec under "BlockView — contenteditable discipline"

---

## File Structure

Files created in this plan:

```
/mnt/Development/StoryForge/
├── package.json                        # pnpm project manifest
├── pnpm-lock.yaml
├── tsconfig.json                       # strict mode, path aliases
├── vite.config.ts                      # Vite + Solid plugin + Tailwind
├── vitest.config.ts                    # Vitest JSDOM env
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .gitignore
├── src/
│   ├── index.tsx                       # app mount
│   ├── index.css                       # Tailwind directives + globals
│   ├── types/
│   │   ├── block.ts                    # Block, BlockType, BlockMetadata
│   │   ├── chapter.ts                  # Chapter
│   │   ├── document.ts                 # Document, DocumentSettings
│   │   ├── ids.ts                      # UUID, ISODateTime
│   │   └── index.ts                    # barrel export
│   ├── utils/
│   │   └── debounce.ts                 # small helper
│   ├── engine/
│   │   ├── measure.ts                  # Measurer interface + pretext backend + memoize
│   │   ├── measure.test.ts
│   │   ├── virtualizer.ts              # computeVisible pure function
│   │   ├── virtualizer.test.ts
│   │   ├── synthetic.ts                # generateSyntheticDoc
│   │   └── synthetic.test.ts
│   ├── store/
│   │   └── document.ts                 # Solid createStore<AppState> + actions
│   ├── ui/
│   │   ├── App.tsx                     # floating-island root layout
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx             # static stub island
│   │   │   ├── Editor.tsx              # virtualized scroll container
│   │   │   └── RightPanel.tsx          # empty stub island
│   │   ├── blocks/
│   │   │   └── BlockView.tsx           # read-only renderer (no contenteditable)
│   │   └── perf/
│   │       └── FpsOverlay.tsx          # dev-only FPS counter
│   └── routes/
│       ├── editor.tsx                  # real editor route (empty doc for now)
│       └── perf-harness.tsx            # /perf route — loads synthetic 500 blocks
└── docs/
    └── perf-phase1.md                  # measurement record (created in last task)
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.gitignore`, `src/index.tsx`, `src/index.css`

- [ ] **Step 1.1: Initialize git**

Run:
```bash
cd /mnt/Development/StoryForge
git init
```

Expected: `Initialized empty Git repository in /mnt/Development/StoryForge/.git/`

- [ ] **Step 1.2: Create `.gitignore`**

```gitignore
node_modules
dist
.DS_Store
*.log
.vite
coverage
```

- [ ] **Step 1.3: Create `package.json`**

```json
{
  "name": "storyforge",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "solid-js": "^1.8.0",
    "@solidjs/router": "^0.13.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-solid": "^2.10.0",
    "vitest": "^1.5.0",
    "@solidjs/testing-library": "^0.8.0",
    "jsdom": "^24.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

Note: Tailwind 4 isn't stable at time of writing; using v3 for Phase 1. Swap in v4 when it lands and the v4 Vite plugin is ready.

- [ ] **Step 1.4: Install dependencies**

Run:
```bash
pnpm install
```

Expected: `node_modules/` created, `pnpm-lock.yaml` generated.

- [ ] **Step 1.5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@engine/*": ["./src/engine/*"],
      "@ui/*": ["./src/ui/*"],
      "@types/*": ["./src/types/*"]
    }
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 1.6: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import path from 'node:path';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
```

- [ ] **Step 1.7: Create `vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [],
      deps: {
        optimizer: {
          web: {
            include: ['solid-js'],
          },
        },
      },
    },
  }),
);
```

- [ ] **Step 1.8: Create Tailwind config**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
```

`postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 1.9: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StoryForge</title>
  </head>
  <body class="bg-stone-100 dark:bg-stone-900">
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.10: Create `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
}
```

- [ ] **Step 1.11: Create minimal `src/index.tsx`**

```tsx
/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';

const App = () => <div class="p-8">StoryForge — scaffolding OK</div>;

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
render(() => <App />, root);
```

- [ ] **Step 1.12: Verify dev server boots**

Run:
```bash
pnpm dev
```

Expected: Vite prints `Local: http://localhost:5173/`. Open it — you should see "StoryForge — scaffolding OK" on a light background. Stop the server (Ctrl-C).

- [ ] **Step 1.13: Verify Vitest runs**

Run:
```bash
pnpm test
```

Expected: `No test files found`. That's correct — no tests yet. Command exits cleanly.

- [ ] **Step 1.14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Solid + TS + Tailwind + Vitest"
```

---

## Task 2: Base TypeScript types

**Files:**
- Create: `src/types/ids.ts`, `src/types/block.ts`, `src/types/chapter.ts`, `src/types/document.ts`, `src/types/index.ts`

These mirror `04-DATA-MODEL.md` but include only what Plan 1 needs. Character/pulse/sonification types come later.

- [ ] **Step 2.1: Create `src/types/ids.ts`**

```ts
/** UUID v4 string */
export type UUID = string;

/** ISO 8601 datetime string (UTC) */
export type ISODateTime = string;
```

- [ ] **Step 2.2: Create `src/types/block.ts`**

```ts
import type { UUID, ISODateTime } from './ids';

export type BlockType = 'text' | 'dialogue' | 'scene' | 'note';

export interface DialogueMetadata {
  speaker_id: UUID;
  speaker_name: string;
}

export interface SceneMetadata {
  location: string;
  time: string;
  character_ids: UUID[];
  mood: string;
}

export interface NoteMetadata {
  color?: string;
}

export type BlockMetadata =
  | { type: 'text' }
  | { type: 'dialogue'; data: DialogueMetadata }
  | { type: 'scene'; data: SceneMetadata }
  | { type: 'note'; data: NoteMetadata };

export interface Block {
  id: UUID;
  chapter_id: UUID;
  type: BlockType;
  content: string;
  order: number;
  metadata: BlockMetadata;
  deleted_at: ISODateTime | null;
  deleted_from: {
    chapter_id: UUID;
    chapter_title: string;
    position: number;
  } | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
```

- [ ] **Step 2.3: Create `src/types/chapter.ts`**

```ts
import type { UUID, ISODateTime } from './ids';

export interface Chapter {
  id: UUID;
  document_id: UUID;
  title: string;
  order: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
```

- [ ] **Step 2.4: Create `src/types/document.ts`**

```ts
import type { UUID, ISODateTime } from './ids';

export interface DocumentSettings {
  font_family: string;
  font_size: number;
  line_height: number;
  editor_width: number;
  theme: 'light' | 'dark' | 'system';
}

export interface Document {
  id: UUID;
  title: string;
  author: string;
  synopsis: string;
  settings: DocumentSettings;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
```

- [ ] **Step 2.5: Create `src/types/index.ts`**

```ts
export * from './ids';
export * from './block';
export * from './chapter';
export * from './document';
```

- [ ] **Step 2.6: Verify the types compile**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No output (success). If errors appear, fix them before committing.

- [ ] **Step 2.7: Commit**

```bash
git add src/types
git commit -m "feat(types): add base Block, Chapter, Document types"
```

---

## Task 3: `utils/debounce.ts` helper

**Files:**
- Create: `src/utils/debounce.ts`, `src/utils/debounce.test.ts`

- [ ] **Step 3.1: Write the failing test**

`src/utils/debounce.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls the function once after the wait elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('forwards arguments from the latest call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d('a');
    d('b');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 3.2: Run the test to confirm it fails**

Run:
```bash
pnpm test
```

Expected: `Cannot find module './debounce'` or equivalent import error.

- [ ] **Step 3.3: Implement `debounce`**

`src/utils/debounce.ts`:
```ts
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, waitMs);
  };
}
```

- [ ] **Step 3.4: Run the test to confirm it passes**

Run:
```bash
pnpm test
```

Expected: 2 tests passed.

- [ ] **Step 3.5: Commit**

```bash
git add src/utils
git commit -m "feat(utils): add debounce helper with tests"
```

---

## Task 4: `engine/virtualizer.ts`

This task comes before `measure.ts` because `virtualizer` is pure and has no external dependencies — easier to TDD first and builds momentum.

**Files:**
- Create: `src/engine/virtualizer.ts`, `src/engine/virtualizer.test.ts`

- [ ] **Step 4.1: Write the failing tests**

`src/engine/virtualizer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeVisible } from './virtualizer';

describe('computeVisible', () => {
  it('returns empty range for empty input', () => {
    const out = computeVisible({
      blockHeights: [],
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 5,
    });
    expect(out).toEqual({
      firstIndex: 0,
      lastIndex: -1,
      offsetTop: 0,
      totalHeight: 0,
    });
  });

  it('computes totalHeight as sum of blockHeights', () => {
    const out = computeVisible({
      blockHeights: [100, 200, 50, 150],
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 0,
    });
    expect(out.totalHeight).toBe(500);
  });

  it('includes all visible blocks at scrollTop=0', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100],
      scrollTop: 0,
      viewportHeight: 250,
      overscan: 0,
    });
    expect(out.firstIndex).toBe(0);
    expect(out.lastIndex).toBe(2); // 0,1,2 — third block is partially visible
    expect(out.offsetTop).toBe(0);
  });

  it('skips blocks above the viewport', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100],
      scrollTop: 250,
      viewportHeight: 100,
      overscan: 0,
    });
    // scrollTop 250 → block 2 starts at 200, so first visible is block 2
    expect(out.firstIndex).toBe(2);
    expect(out.offsetTop).toBe(200);
  });

  it('applies overscan on both sides', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100, 100, 100, 100, 100],
      scrollTop: 250,
      viewportHeight: 100,
      overscan: 1,
    });
    // without overscan: first=2, last=3. With overscan 1: first=1, last=4.
    expect(out.firstIndex).toBe(1);
    expect(out.lastIndex).toBe(4);
    expect(out.offsetTop).toBe(100); // offset is first block's top
  });

  it('clamps overscan at array boundaries', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100],
      scrollTop: 0,
      viewportHeight: 100,
      overscan: 10,
    });
    expect(out.firstIndex).toBe(0);
    expect(out.lastIndex).toBe(2);
  });

  it('clamps when scrollTop is past the end', () => {
    const out = computeVisible({
      blockHeights: [100, 100, 100],
      scrollTop: 10000,
      viewportHeight: 100,
      overscan: 0,
    });
    expect(out.firstIndex).toBe(2);
    expect(out.lastIndex).toBe(2);
  });
});
```

- [ ] **Step 4.2: Run the tests to confirm they fail**

Run: `pnpm test virtualizer`
Expected: Import error / module not found.

- [ ] **Step 4.3: Implement `computeVisible`**

`src/engine/virtualizer.ts`:
```ts
export interface VirtualizerInput {
  blockHeights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}

export interface VirtualizerOutput {
  firstIndex: number;
  lastIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function computeVisible(input: VirtualizerInput): VirtualizerOutput {
  const { blockHeights, scrollTop, viewportHeight, overscan } = input;
  const n = blockHeights.length;

  if (n === 0) {
    return { firstIndex: 0, lastIndex: -1, offsetTop: 0, totalHeight: 0 };
  }

  // Prefix-sum scan to find first visible index.
  let first = 0;
  let accTop = 0;
  for (let i = 0; i < n; i++) {
    if (accTop + blockHeights[i] > scrollTop) {
      first = i;
      break;
    }
    accTop += blockHeights[i];
    if (i === n - 1) first = n - 1; // scrollTop past end
  }

  // Continue scanning until we've covered viewportHeight.
  let last = first;
  let running = accTop;
  const viewportEnd = scrollTop + viewportHeight;
  for (let i = first; i < n; i++) {
    running += blockHeights[i];
    last = i;
    if (running >= viewportEnd) break;
  }

  // Apply overscan, clamped.
  const firstWithOverscan = Math.max(0, first - overscan);
  const lastWithOverscan = Math.min(n - 1, last + overscan);

  // offsetTop is the top of the first rendered block (including overscan).
  let offsetTop = 0;
  for (let i = 0; i < firstWithOverscan; i++) offsetTop += blockHeights[i];

  let totalHeight = 0;
  for (let i = 0; i < n; i++) totalHeight += blockHeights[i];

  return {
    firstIndex: firstWithOverscan,
    lastIndex: lastWithOverscan,
    offsetTop,
    totalHeight,
  };
}
```

- [ ] **Step 4.4: Run the tests to confirm they pass**

Run: `pnpm test virtualizer`
Expected: 7 tests passed.

- [ ] **Step 4.5: Commit**

```bash
git add src/engine/virtualizer.ts src/engine/virtualizer.test.ts
git commit -m "feat(engine): add computeVisible pure function with tests"
```

---

## Task 5: `engine/measure.ts` — interface and cache (no `pretext` backend yet)

This task establishes the stable interface and a working memoized wrapper, with a **stub backend** that returns deterministic heights based on content length. The real `pretext` backend is wired in Task 6, where API research happens.

**Files:**
- Create: `src/engine/measure.ts`, `src/engine/measure.test.ts`

- [ ] **Step 5.1: Write the failing tests**

`src/engine/measure.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createStubMeasurer, createMemoizedMeasurer, type Measurer, DEFAULT_BLOCK_HEIGHT } from './measure';

describe('createStubMeasurer', () => {
  it('returns DEFAULT_BLOCK_HEIGHT for empty string', () => {
    const m = createStubMeasurer();
    const r = m.measure({ text: '', font: '16px serif', width: 600, lineHeight: 1.8 });
    expect(r.height).toBe(DEFAULT_BLOCK_HEIGHT);
    expect(r.lineCount).toBe(1);
  });

  it('scales height with text length (deterministic stub)', () => {
    const m = createStubMeasurer();
    const short = m.measure({ text: 'hello', font: '16px serif', width: 600, lineHeight: 1.8 });
    const long = m.measure({ text: 'x'.repeat(1000), font: '16px serif', width: 600, lineHeight: 1.8 });
    expect(long.height).toBeGreaterThan(short.height);
  });
});

describe('createMemoizedMeasurer', () => {
  it('delegates on first call, caches on second', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    const input = { text: 'abc', font: '16px serif', width: 600, lineHeight: 1.8 };

    const r1 = memoized.measure(input);
    const r2 = memoized.measure(input);

    expect(backend.measure).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it('invalidates cache when content changes', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    memoized.measure({ text: 'a', font: 'f', width: 600, lineHeight: 1.8 });
    memoized.measure({ text: 'b', font: 'f', width: 600, lineHeight: 1.8 });
    expect(backend.measure).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache when width changes', () => {
    const backend: Measurer = {
      measure: vi.fn().mockReturnValue({ height: 42, lineCount: 3 }),
    };
    const memoized = createMemoizedMeasurer(backend);
    memoized.measure({ text: 'abc', font: 'f', width: 600, lineHeight: 1.8 });
    memoized.measure({ text: 'abc', font: 'f', width: 800, lineHeight: 1.8 });
    expect(backend.measure).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 5.2: Run the tests to confirm they fail**

Run: `pnpm test measure`
Expected: Module not found.

- [ ] **Step 5.3: Implement `measure.ts` interface, stub backend, and memoized wrapper**

`src/engine/measure.ts`:
```ts
export interface MeasureInput {
  text: string;
  font: string;
  width: number;
  lineHeight: number;
}

export interface MeasureResult {
  height: number;
  lineCount: number;
}

export interface Measurer {
  measure(input: MeasureInput): MeasureResult;
}

/** Fallback height used when text is empty or backend cannot measure. */
export const DEFAULT_BLOCK_HEIGHT = 32;

/**
 * Deterministic stub backend used in tests and as a placeholder until the
 * pretext backend is wired in Task 6. Not meant for production use.
 */
export function createStubMeasurer(): Measurer {
  return {
    measure({ text, lineHeight }) {
      if (text.length === 0) {
        return { height: DEFAULT_BLOCK_HEIGHT, lineCount: 1 };
      }
      const approxCharsPerLine = 80;
      const lines = Math.max(1, Math.ceil(text.length / approxCharsPerLine));
      return { height: Math.round(lines * 16 * lineHeight), lineCount: lines };
    },
  };
}

/**
 * Canvas fallback backend — NOT IMPLEMENTED IN PLAN 1.
 * Declared so the interface signals swap-ability per the spec.
 */
export function createCanvasMeasurer(): Measurer {
  return {
    measure() {
      throw new Error('createCanvasMeasurer not implemented — see spec fallback plan');
    },
  };
}

/** Wraps a Measurer with a keyed cache. */
export function createMemoizedMeasurer(backend: Measurer): Measurer {
  const cache = new Map<string, MeasureResult>();
  return {
    measure(input) {
      const key = `${input.width}|${input.font}|${input.lineHeight}|${input.text}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const result = backend.measure(input);
      cache.set(key, result);
      return result;
    },
  };
}
```

- [ ] **Step 5.4: Run the tests to confirm they pass**

Run: `pnpm test measure`
Expected: 5 tests passed.

- [ ] **Step 5.5: Commit**

```bash
git add src/engine/measure.ts src/engine/measure.test.ts
git commit -m "feat(engine): add Measurer interface with stub backend and memoization"
```

---

## Task 6: Wire `pretext` as the real backend (API research first)

This task is different from the others: the `pretext` library's concrete API is not known in advance (per `02-TECH-STACK.md` and ADR-002). The first steps are research, not coding.

**Files:**
- Modify: `src/engine/measure.ts`
- Create: `docs/pretext-research.md`

- [ ] **Step 6.1: Research the `pretext` package**

Run:
```bash
pnpm view pretext
```

If this returns a package, record: current version, entry points, documented API surface, any TypeScript types.

If `pnpm view pretext` returns "not found", search npm for candidate packages under alternate names referenced in the project docs (check `02-TECH-STACK.md` for the Cheng Lou attribution — the package may be published under a different name such as `@chenglou/pretext`). Write findings to `docs/pretext-research.md`.

- [ ] **Step 6.2: Document API in `docs/pretext-research.md`**

Write a short note (under 300 words) covering:
- Package name and version used
- Install command
- The function/class used for measurement
- Its input signature
- Its output signature
- Any known quirks or limitations discovered during research
- A link to the source repo / docs

If no usable package exists, document that explicitly and proceed to Step 6.3b (fallback decision).

- [ ] **Step 6.3a: Install `pretext` (if it exists)**

Run:
```bash
pnpm add pretext
```

(Substitute the actual package name found in research.)

Expected: Package added to `dependencies`, `pnpm-lock.yaml` updated.

- [ ] **Step 6.3b: If `pretext` does not exist as a usable package, escalate**

Stop task execution and surface the finding: "The `pretext` package referenced in the spec cannot be located. Options: (1) activate the Canvas `measureText` fallback as the primary backend in Plan 1, accepting reduced measurement accuracy; (2) pause Plan 1 and investigate alternative libraries; (3) contact the spec author for clarification."

Do not proceed to Step 6.4 until the user decides. If Option 1 is chosen, implement `createCanvasMeasurer()` in place of `createPretextMeasurer()` and adjust the next steps accordingly — the rest of Plan 1 is agnostic to which backend fulfills `Measurer`.

- [ ] **Step 6.4: Add `createPretextMeasurer()` to `src/engine/measure.ts`**

Replace the placeholder `createCanvasMeasurer` location with an additional export. Add:

```ts
/**
 * pretext-backed measurer. API shape depends on the installed pretext version —
 * see docs/pretext-research.md for the exact call signature used below.
 */
export function createPretextMeasurer(): Measurer {
  // Replace this body with the actual pretext API call discovered in Step 6.1.
  // The interface above does not need to change — only the internals of this function.
  return {
    measure(input) {
      // Example shape — to be replaced with the real call:
      //   const result = pretext.measure({ text, font, maxWidth, lineHeight });
      //   return { height: result.height, lineCount: result.lines };
      throw new Error(
        'createPretextMeasurer not yet wired — see docs/pretext-research.md and replace this body',
      );
    },
  };
}
```

The engineer replaces the stubbed body with the actual `pretext` call based on their research. The function signature does not change.

- [ ] **Step 6.5: Add an integration-style test that exercises the real backend**

Add to `src/engine/measure.test.ts`:
```ts
import { createPretextMeasurer } from './measure';

describe('createPretextMeasurer (integration)', () => {
  it('measures a non-empty string without throwing', () => {
    const m = createPretextMeasurer();
    const r = m.measure({
      text: 'The quick brown fox jumps over the lazy dog.',
      font: '16px Georgia',
      width: 600,
      lineHeight: 1.8,
    });
    expect(r.height).toBeGreaterThan(0);
    expect(r.lineCount).toBeGreaterThanOrEqual(1);
  });

  it('returns a larger height for wrapping text', () => {
    const m = createPretextMeasurer();
    const short = m.measure({ text: 'hi', font: '16px Georgia', width: 600, lineHeight: 1.8 });
    const long = m.measure({
      text: 'The quick brown fox jumps over the lazy dog. '.repeat(20),
      font: '16px Georgia',
      width: 600,
      lineHeight: 1.8,
    });
    expect(long.height).toBeGreaterThan(short.height);
  });
});
```

- [ ] **Step 6.6: Run the tests**

Run: `pnpm test measure`
Expected: all previous tests still pass, plus the two new `createPretextMeasurer` integration tests pass. If `pretext` requires a browser environment and the JSDOM env cannot load it, mark these tests with `it.skipIf(typeof CanvasRenderingContext2D === 'undefined')` and run them manually via the perf harness in Task 14.

- [ ] **Step 6.7: Commit**

```bash
git add src/engine/measure.ts src/engine/measure.test.ts docs/pretext-research.md package.json pnpm-lock.yaml
git commit -m "feat(engine): wire pretext as the measure backend"
```

---

## Task 7: `engine/synthetic.ts` — seeded PRNG generator

**Files:**
- Create: `src/engine/synthetic.ts`, `src/engine/synthetic.test.ts`

- [ ] **Step 7.1: Write the failing tests**

`src/engine/synthetic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateSyntheticDoc } from './synthetic';

describe('generateSyntheticDoc', () => {
  const opts = {
    chapterCount: 10,
    blocksPerChapter: 50,
    wordsPerBlock: 200,
    typeDistribution: { text: 0.6, dialogue: 0.25, scene: 0.1, note: 0.05 },
    seed: 42,
  };

  it('generates the requested number of chapters', () => {
    const { chapters } = generateSyntheticDoc(opts);
    expect(chapters).toHaveLength(10);
  });

  it('generates the requested number of blocks per chapter', () => {
    const { blocks } = generateSyntheticDoc(opts);
    expect(blocks).toHaveLength(10 * 50);
  });

  it('is deterministic for a given seed', () => {
    const a = generateSyntheticDoc(opts);
    const b = generateSyntheticDoc(opts);
    expect(a.blocks[0].content).toBe(b.blocks[0].content);
    expect(a.blocks[123].content).toBe(b.blocks[123].content);
  });

  it('produces different content for different seeds', () => {
    const a = generateSyntheticDoc(opts);
    const b = generateSyntheticDoc({ ...opts, seed: 1 });
    expect(a.blocks[0].content).not.toBe(b.blocks[0].content);
  });

  it('roughly matches the type distribution', () => {
    const { blocks } = generateSyntheticDoc(opts);
    const counts = { text: 0, dialogue: 0, scene: 0, note: 0 };
    for (const b of blocks) counts[b.type]++;
    const total = blocks.length;
    expect(counts.text / total).toBeCloseTo(0.6, 1);
    expect(counts.dialogue / total).toBeCloseTo(0.25, 1);
    expect(counts.scene / total).toBeCloseTo(0.1, 1);
    expect(counts.note / total).toBeCloseTo(0.05, 1);
  });

  it('gives every block a non-empty content string', () => {
    const { blocks } = generateSyntheticDoc(opts);
    for (const b of blocks) expect(b.content.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7.2: Run the tests to confirm they fail**

Run: `pnpm test synthetic`
Expected: Module not found.

- [ ] **Step 7.3: Implement `generateSyntheticDoc`**

`src/engine/synthetic.ts`:
```ts
import type { Block, BlockType, Chapter, Document } from '@/types';

export interface SyntheticDocOptions {
  chapterCount: number;
  blocksPerChapter: number;
  wordsPerBlock: number;
  typeDistribution: {
    text: number;
    dialogue: number;
    scene: number;
    note: number;
  };
  seed: number;
}

export interface SyntheticDoc {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
}

/** Mulberry32 — small, fast, well-distributed seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'the', 'and', 'of', 'to', 'in', 'a', 'was', 'he', 'her', 'she', 'they',
  'said', 'whispered', 'looked', 'saw', 'felt', 'knew', 'remembered',
  'evening', 'morning', 'shadow', 'light', 'door', 'window', 'hand', 'voice',
  'silence', 'rain', 'forest', 'road', 'letter', 'name', 'story', 'memory',
];

function makeWord(rand: () => number): string {
  return WORDS[Math.floor(rand() * WORDS.length)];
}

function makeSentence(rand: () => number, targetWords: number): string {
  const words: string[] = [];
  for (let i = 0; i < targetWords; i++) words.push(makeWord(rand));
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}

function makeParagraph(rand: () => number, totalWords: number): string {
  const sentences: string[] = [];
  let remaining = totalWords;
  while (remaining > 0) {
    const sentenceLen = Math.min(remaining, 5 + Math.floor(rand() * 15));
    sentences.push(makeSentence(rand, sentenceLen));
    remaining -= sentenceLen;
  }
  return sentences.join(' ');
}

function pickType(rand: () => number, dist: SyntheticDocOptions['typeDistribution']): BlockType {
  const r = rand();
  if (r < dist.text) return 'text';
  if (r < dist.text + dist.dialogue) return 'dialogue';
  if (r < dist.text + dist.dialogue + dist.scene) return 'scene';
  return 'note';
}

function makeId(rand: () => number): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rand() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateSyntheticDoc(opts: SyntheticDocOptions): SyntheticDoc {
  const rand = mulberry32(opts.seed);
  const now = new Date().toISOString();

  const document: Document = {
    id: makeId(rand),
    title: 'Synthetic Test Document',
    author: 'Test',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    created_at: now,
    updated_at: now,
  };

  const chapters: Chapter[] = [];
  const blocks: Block[] = [];

  for (let c = 0; c < opts.chapterCount; c++) {
    const chapter: Chapter = {
      id: makeId(rand),
      document_id: document.id,
      title: `Chapter ${c + 1}`,
      order: c,
      created_at: now,
      updated_at: now,
    };
    chapters.push(chapter);

    for (let b = 0; b < opts.blocksPerChapter; b++) {
      const type = pickType(rand, opts.typeDistribution);
      const content = makeParagraph(rand, opts.wordsPerBlock);
      const metadata: Block['metadata'] =
        type === 'text' ? { type: 'text' } :
        type === 'dialogue' ? { type: 'dialogue', data: { speaker_id: 'synthetic', speaker_name: 'Speaker' } } :
        type === 'scene' ? { type: 'scene', data: { location: 'Somewhere', time: 'Evening', character_ids: [], mood: 'neutral' } } :
        { type: 'note', data: {} };

      blocks.push({
        id: makeId(rand),
        chapter_id: chapter.id,
        type,
        content,
        order: b,
        metadata,
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return { document, chapters, blocks };
}
```

- [ ] **Step 7.4: Run the tests to confirm they pass**

Run: `pnpm test synthetic`
Expected: 6 tests passed.

- [ ] **Step 7.5: Commit**

```bash
git add src/engine/synthetic.ts src/engine/synthetic.test.ts
git commit -m "feat(engine): add seeded synthetic document generator"
```

---

## Task 8: `store/document.ts` — Solid store

**Files:**
- Create: `src/store/document.ts`

- [ ] **Step 8.1: Create the store**

`src/store/document.ts`:
```ts
import { createStore } from 'solid-js/store';
import type { Block, Chapter, Document, UUID } from '@/types';
import type { SyntheticDoc } from '@/engine/synthetic';

export interface ViewportState {
  scrollTop: number;
  viewportHeight: number;
}

export interface BlockMeasurement {
  height: number;
  contentHash: string;
}

export interface AppState {
  document: Document | null;
  chapters: Chapter[];
  blocks: Record<UUID, Block>;
  blockOrder: UUID[];               // flat list of block IDs across chapters, in scroll order
  activeChapterId: UUID | null;
  measurements: Record<UUID, BlockMeasurement>;
  viewport: ViewportState;
}

const initialState: AppState = {
  document: null,
  chapters: [],
  blocks: {},
  blockOrder: [],
  activeChapterId: null,
  measurements: {},
  viewport: { scrollTop: 0, viewportHeight: 0 },
};

export const [store, setStore] = createStore<AppState>(initialState);

export function loadSyntheticDoc(doc: SyntheticDoc): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of doc.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  setStore({
    document: doc.document,
    chapters: doc.chapters,
    blocks,
    blockOrder,
    activeChapterId: doc.chapters[0]?.id ?? null,
    measurements: {},
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}

export function setViewport(scrollTop: number, viewportHeight: number): void {
  setStore('viewport', { scrollTop, viewportHeight });
}

export function setMeasurement(blockId: UUID, measurement: BlockMeasurement): void {
  setStore('measurements', blockId, measurement);
}
```

- [ ] **Step 8.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/store
git commit -m "feat(store): add document store with loadSyntheticDoc action"
```

---

## Task 9: `ui/blocks/BlockView.tsx` — read-only renderer

**Files:**
- Create: `src/ui/blocks/BlockView.tsx`

- [ ] **Step 9.1: Create the read-only BlockView**

`src/ui/blocks/BlockView.tsx`:
```tsx
import type { Block } from '@/types';

const TYPE_LABELS: Record<Block['type'], { label: string; className: string }> = {
  text:     { label: 'TEXT',     className: 'text-violet-500' },
  dialogue: { label: 'DIALOGUE', className: 'text-teal-600' },
  scene:    { label: 'SCENE',    className: 'text-orange-600' },
  note:     { label: 'NOTE',     className: 'text-stone-400' },
};

export const BlockView = (props: { block: Block }) => {
  const meta = () => TYPE_LABELS[props.block.type];
  return (
    <div class="py-2" data-block-id={props.block.id}>
      <div class={`text-[10px] uppercase tracking-wider font-medium mb-1 ${meta().className}`}>
        {meta().label}
      </div>
      <div class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100 whitespace-pre-wrap">
        {props.block.content}
      </div>
    </div>
  );
};
```

- [ ] **Step 9.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 9.3: Commit**

```bash
git add src/ui/blocks
git commit -m "feat(ui): add read-only BlockView component"
```

---

## Task 10: `ui/layout/Editor.tsx` — virtualized scroll container

**Files:**
- Create: `src/ui/layout/Editor.tsx`

- [ ] **Step 10.1: Create the virtualized Editor**

`src/ui/layout/Editor.tsx`:
```tsx
import { createEffect, createMemo, For } from 'solid-js';
import { BlockView } from '@/ui/blocks/BlockView';
import { computeVisible } from '@/engine/virtualizer';
import { createMemoizedMeasurer, createPretextMeasurer } from '@/engine/measure';
import { store, setViewport, setMeasurement } from '@/store/document';
import type { Block } from '@/types';

const EDITOR_WIDTH = 680;
const EDITOR_FONT = '16px Georgia, serif';
const LINE_HEIGHT = 1.8;
const OVERSCAN = 5;

const measurer = createMemoizedMeasurer(createPretextMeasurer());

function contentHash(s: string): string {
  // djb2 — fast, deterministic, good enough for cache keys
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

export const Editor = () => {
  let scrollEl!: HTMLDivElement;
  let ticking = false;

  // Measure all blocks once when blockOrder changes.
  createEffect(() => {
    const order = store.blockOrder;
    for (const id of order) {
      const block = store.blocks[id];
      if (!block) continue;
      const hash = contentHash(block.content);
      const cached = store.measurements[id];
      if (cached && cached.contentHash === hash) continue;
      const result = measurer.measure({
        text: block.content,
        font: EDITOR_FONT,
        width: EDITOR_WIDTH,
        lineHeight: LINE_HEIGHT,
      });
      setMeasurement(id, { height: result.height, contentHash: hash });
    }
  });

  const orderedHeights = createMemo(() =>
    store.blockOrder.map((id) => store.measurements[id]?.height ?? 0),
  );

  const visible = createMemo(() =>
    computeVisible({
      blockHeights: orderedHeights(),
      scrollTop: store.viewport.scrollTop,
      viewportHeight: store.viewport.viewportHeight,
      overscan: OVERSCAN,
    }),
  );

  const visibleBlocks = createMemo<Block[]>(() => {
    const v = visible();
    const ids = store.blockOrder.slice(v.firstIndex, v.lastIndex + 1);
    return ids.map((id) => store.blocks[id]).filter((b): b is Block => Boolean(b));
  });

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
      ticking = false;
    });
  };

  // Set initial viewport height after mount.
  createEffect(() => {
    if (scrollEl) setViewport(scrollEl.scrollTop, scrollEl.clientHeight);
  });

  return (
    <div
      ref={scrollEl}
      onScroll={onScroll}
      class="h-full overflow-auto bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700"
    >
      <div style={{ height: `${visible().totalHeight}px`, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visible().offsetTop}px)`,
            'max-width': `${EDITOR_WIDTH}px`,
            'margin-left': 'auto',
            'margin-right': 'auto',
            padding: '24px',
          }}
        >
          <For each={visibleBlocks()} fallback={<div class="p-8 text-stone-500">No document loaded</div>}>
            {(block) => <BlockView block={block} />}
          </For>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 10.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 10.3: Commit**

```bash
git add src/ui/layout/Editor.tsx
git commit -m "feat(ui): add virtualized Editor scroll container"
```

---

## Task 11: Layout stubs — `Sidebar`, `RightPanel`, `App`

**Files:**
- Create: `src/ui/layout/Sidebar.tsx`, `src/ui/layout/RightPanel.tsx`, `src/ui/App.tsx`

- [ ] **Step 11.1: Create `Sidebar.tsx`**

```tsx
import { store } from '@/store/document';
import { For } from 'solid-js';

export const Sidebar = () => (
  <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto">
    <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400 mb-2">Chapters</div>
    <For each={store.chapters} fallback={<div class="text-stone-500 text-sm">No chapters</div>}>
      {(c) => (
        <div class="py-1 text-sm text-stone-800 dark:text-stone-200">{c.title}</div>
      )}
    </For>
  </div>
);
```

- [ ] **Step 11.2: Create `RightPanel.tsx`**

```tsx
export const RightPanel = () => (
  <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4">
    <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">Panel (stub)</div>
  </div>
);
```

- [ ] **Step 11.3: Create `src/ui/App.tsx`**

```tsx
import { Sidebar } from './layout/Sidebar';
import { Editor } from './layout/Editor';
import { RightPanel } from './layout/RightPanel';
import { FpsOverlay } from './perf/FpsOverlay';
import type { JSX } from 'solid-js';

export const App = (props: { children?: JSX.Element }) => (
  <div class="h-full w-full grid grid-cols-[260px_1fr_280px] gap-4 p-4 bg-stone-100 dark:bg-stone-900">
    <Sidebar />
    <Editor />
    <RightPanel />
    <FpsOverlay />
    {props.children}
  </div>
);
```

- [ ] **Step 11.4: Verify it compiles (will fail on FpsOverlay — next task)**

Run: `pnpm exec tsc --noEmit`
Expected: Error about missing `FpsOverlay`. That's fine — Task 12 creates it. Do not commit yet.

---

## Task 12: `ui/perf/FpsOverlay.tsx`

**Files:**
- Create: `src/ui/perf/FpsOverlay.tsx`

- [ ] **Step 12.1: Create the FpsOverlay**

`src/ui/perf/FpsOverlay.tsx`:
```tsx
import { createSignal, onCleanup, onMount } from 'solid-js';

export const FpsOverlay = () => {
  const [fps, setFps] = createSignal(0);

  onMount(() => {
    let frames: number[] = [];
    let rafId = 0;

    const tick = (now: number) => {
      frames.push(now);
      // Keep only frames from the last second.
      const cutoff = now - 1000;
      while (frames.length > 0 && frames[0] < cutoff) frames.shift();
      setFps(frames.length);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(rafId));
  });

  return (
    <div class="fixed bottom-4 right-4 px-2 py-1 rounded-lg bg-stone-900/80 text-stone-100 text-xs font-mono pointer-events-none">
      {fps()} fps
    </div>
  );
};
```

- [ ] **Step 12.2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 12.3: Commit layout + FpsOverlay together**

```bash
git add src/ui/layout src/ui/App.tsx src/ui/perf
git commit -m "feat(ui): add floating-island layout and FpsOverlay"
```

---

## Task 13: Routes — `/` editor and `/perf` harness

**Files:**
- Create: `src/routes/editor.tsx`, `src/routes/perf-harness.tsx`
- Modify: `src/index.tsx`

- [ ] **Step 13.1: Create `routes/editor.tsx`**

```tsx
import { App } from '@/ui/App';

export const EditorRoute = () => <App />;
```

- [ ] **Step 13.2: Create `routes/perf-harness.tsx`**

```tsx
import { onMount } from 'solid-js';
import { App } from '@/ui/App';
import { generateSyntheticDoc } from '@/engine/synthetic';
import { loadSyntheticDoc } from '@/store/document';

export const PerfHarnessRoute = () => {
  onMount(() => {
    const doc = generateSyntheticDoc({
      chapterCount: 10,
      blocksPerChapter: 50,
      wordsPerBlock: 200,
      typeDistribution: { text: 0.6, dialogue: 0.25, scene: 0.1, note: 0.05 },
      seed: 42,
    });
    loadSyntheticDoc(doc);
  });

  return <App />;
};
```

- [ ] **Step 13.3: Update `src/index.tsx` with the router**

Replace the existing minimal `src/index.tsx` with:
```tsx
/* @refresh reload */
import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

render(
  () => (
    <Router>
      <Route path="/" component={EditorRoute} />
      <Route path="/perf" component={PerfHarnessRoute} />
    </Router>
  ),
  root,
);
```

- [ ] **Step 13.4: Boot the dev server and manually verify**

Run: `pnpm dev`

Open `http://localhost:5173/` — should show the empty floating-island layout (no chapters, "No document loaded" in the editor, FPS overlay in the corner).

Open `http://localhost:5173/perf` — should show 10 chapters in the sidebar and a scrollable editor with synthetic blocks. Scroll through — the FPS overlay should hover near 60.

If the FPS number is under 50 during normal scrolling, stop and investigate before Task 14 (measurement). Common suspects: measurement running on every frame (should be once per content change), `<For>` not keyed properly, `createMemo` recomputing too often.

Stop the dev server (Ctrl-C).

- [ ] **Step 13.5: Commit**

```bash
git add src/routes src/index.tsx
git commit -m "feat(routes): wire editor and perf-harness routes"
```

---

## Task 14: First perf measurement

**Files:**
- Create: `docs/perf-phase1.md`

This task is primarily a measurement and documentation exercise, not code.

- [ ] **Step 14.1: Boot the dev server in production mode for a realistic measurement**

Run:
```bash
pnpm build
pnpm preview
```

Open the URL printed by `pnpm preview` (usually `http://localhost:4173/perf`).

- [ ] **Step 14.2: Measure scroll FPS**

1. Open Chrome DevTools → Performance tab.
2. Click Record.
3. In the editor, scroll from top to bottom of the 500-block synthetic doc using the mouse wheel (target: a steady ~3-second scroll, not a flick).
4. Stop the recording.
5. Read the FPS chart. Record the **median** value during the active scroll.

- [ ] **Step 14.3: Measure initial render**

1. Reload `/perf` with DevTools Performance recording.
2. Record time from navigation start to first meaningful paint (look for the first `Paint` event after `loadSyntheticDoc` completes).
3. Target: <500ms.

- [ ] **Step 14.4: Record memory baseline**

1. DevTools → Memory tab.
2. Take a heap snapshot after the synthetic doc loads.
3. Record total heap size in MB.

- [ ] **Step 14.5: Write `docs/perf-phase1.md`**

Template:
```markdown
# Phase 1 Perf Measurement — [DATE]

## Environment
- Browser: Chrome [version]
- Build: production (`pnpm build && pnpm preview`)
- Machine: [CPU / RAM]
- Doc: 500 synthetic blocks, seed 42, 10 chapters × 50 blocks, ~200 words/block

## Results

| Metric | Target | Measured | Pass? |
|--------|--------|----------|-------|
| Scroll FPS (median) | ≥ 58 | [value] | [y/n] |
| Initial render | < 500 ms | [value] | [y/n] |
| Input latency | < 16 ms | deferred — no editing in Plan 1 | n/a |
| Heap size baseline | no target | [value] MB | — |

## Observations
[Anything notable — dropped frames during fast scroll, GC pauses, etc.]

## Verdict
[Either: "The `pretext` + virtualization bet validates. Plan 2 is green-lit." OR:
"Scroll FPS of [X] is below target. Next steps: [investigation direction]."]
```

Fill in the bracketed values with real measurements.

- [ ] **Step 14.6: Commit the measurement**

```bash
git add docs/perf-phase1.md
git commit -m "docs: record Phase 1 perf measurement"
```

- [ ] **Step 14.7: Final verification**

Run:
```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: All tests pass, no TypeScript errors.

---

## Plan Exit Criteria

Plan 1 is complete when **all** of these hold:

- [ ] `pnpm test` runs all engine unit tests green
- [ ] `pnpm exec tsc --noEmit` produces no errors
- [ ] `pnpm dev` boots both `/` and `/perf` without console errors
- [ ] The `/perf` route scrolls visibly smoothly (FPS overlay stays high)
- [ ] `docs/perf-phase1.md` records the first FPS measurement with a pass/fail verdict
- [ ] `docs/pretext-research.md` documents the actual `pretext` API used

If the perf verdict is PASS, Plan 2 (editor experience) can begin. If FAIL, the plan output still has value: it answers the feasibility question in 2 weeks rather than 6, and informs the decision to activate the Canvas fallback or pivot the measurement strategy.

---

## Self-Review Notes

**Spec coverage check:**
- Engine layer (measure, virtualizer, synthetic) — Tasks 4, 5, 6, 7 ✓
- Perf harness route — Task 13 ✓
- Floating-island layout — Tasks 11, 12 ✓
- Read-only BlockView — Task 9 ✓
- Store layer — Task 8 ✓
- First FPS measurement — Task 14 ✓
- BlockView contenteditable discipline — **deferred to Plan 2** (explicitly out of scope)
- Keybindings, IME, paste — **deferred to Plan 2**
- Input latency measurement — **deferred to Plan 2** (no editing yet, not measurable in Plan 1)

**Placeholder scan:** No TBDs. Task 6 Step 6.4 intentionally contains a throwing stub body because the `pretext` API is unknown until research; the step explicitly says "replace this body" with the researched call. This is not a plan placeholder — it is a documented research-dependent step.

**Type consistency:** `Measurer`, `MeasureInput`, `MeasureResult`, `BlockMeasurement`, `VirtualizerInput`, `VirtualizerOutput` names are consistent across tasks. Store field names (`blockOrder`, `measurements`, `viewport`) are consistent between Tasks 8, 10, 11.
