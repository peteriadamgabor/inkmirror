# StoryForge Phase 1 PoC — Design Spec

**Date:** 2026-04-12
**Status:** Draft for review
**Scope:** Phase 1 Proof of Concept as defined in `05-ROADMAP-AND-ADR.md`

---

## Goal

Prove that a block-based editor built on `pretext` + Solid.js + virtualization can sustain 60 FPS at 500 blocks *and* feel natural to write in. Build it as a real foundation, not a throwaway spike — Phase 2 continues on top of this codebase without a rewrite.

## Non-goals (explicitly deferred to Phase 2+)

- SurrealDB, persistence, anything touching IndexedDB
- Real chapter CRUD (Phase 1 has one hardcoded chapter)
- Drag-and-drop block reordering
- Dead Text Graveyard UI (the `deleted_at` field exists, no view)
- Any AI, any Web Worker, any Tone.js
- Export of any kind
- Character cards, scene metadata editors
- Command palette, focus mode / Zen mode animations

---

## Success criteria (the exit gate)

Phase 1 ships only when **all** of these hold:

| # | Criterion | Measurement |
|---|-----------|-------------|
| 1 | Scroll at 500 blocks ≥ 58 FPS median | Chrome DevTools Performance, documented in `docs/perf-phase1.md` |
| 2 | Input latency < 16ms at 500 blocks | DevTools, keydown → next paint |
| 3 | Writing a paragraph for 5+ minutes feels natural without cursor quirks | Author's gut check |
| 4 | Enter / Backspace-merge / Arrow-navigation work correctly | Manual test against written checklist |
| 5 | IME (Hungarian diacritics) works without breaking | Manual test with composition events |
| 6 | Engine layer unit tests pass | `measure.ts`, `virtualizer.ts`, `synthetic.ts` |
| 7 | `measure.ts` interface is stable and a fallback backend is at least documented | Interface code review |

If perf fails and cannot be fixed, the `pretext` bet is re-evaluated per ADR-002 and the Canvas `measureText` fallback is activated.

---

## Approach

**Perf-first vertical slice.** Build the scariest thing first: engine layer + perf harness with 500 synthetic placeholder blocks, measured for FPS by end of week 2. Only then layer the editing experience (contenteditable, keybindings, IME) on top of a validated foundation.

**Rationale:** The entire Phase 1 premise is "the `pretext` bet works." If it doesn't, every other piece of work is waste. Answering the feasibility question in 2 weeks (not 6) minimizes sunk cost on a failed bet. If it succeeds, weeks 3–5 carry only execution risk, not feasibility risk.

**Alternatives considered and rejected:**

- *Thin vertical slice first* (build one block end-to-end, scale later): buries the riskiest question until week 4.
- *Two parallel tracks* (engine + UI developed separately, merged late): the Solid + contenteditable + virtualized-scroll integration is exactly where the worst surprises live; deferring integration is dangerous.

---

## Architecture & Module Boundaries

```
src/
├── types/                   # Block, Chapter, Document, BlockMetadata, UUID
├── engine/
│   ├── measure.ts           # pretext wrapper, stable interface, memoized
│   ├── virtualizer.ts       # viewport → visible block range + offsets (pure)
│   └── synthetic.ts         # seeded generator for the 500-block test doc
├── store/
│   └── document.ts          # Solid createStore<AppState>
├── ui/
│   ├── App.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx      # chapter list (static in PoC)
│   │   ├── Editor.tsx       # virtualized scroll container
│   │   └── RightPanel.tsx   # empty stub island
│   ├── blocks/
│   │   └── BlockView.tsx    # single component handling all 4 block types
│   └── perf/
│       └── FpsOverlay.tsx   # dev-only FPS counter
├── routes/
│   ├── editor.tsx           # real editor route
│   └── perf-harness.tsx     # /perf — loads synthetic 500-block doc
└── utils/
    └── debounce.ts
```

### Layering (import rule)

```
ui/ → store/ → engine/
ui/ → engine/   (only measure.ts, since it is pure)
```

- `engine/` is pure, UI-independent, unit-tested. Never imports from `ui/` or `store/`.
- `store/` owns mutations. `ui/` only reads from the store and dispatches through it.
- `BlockView` handles all four block types via the discriminated union on `block.metadata.type`. No per-type component until a type earns it.
- The perf harness is a **route**, not a test file. It uses the real engine, real store, real `BlockView` — it just seeds synthetic data. If the harness is fast, the real app is fast.

---

## Engine Layer

### `engine/measure.ts`

The stable interface that hides `pretext`. Call sites depend only on `Measurer`.

```typescript
export interface MeasureInput {
  text: string;
  font: string;        // CSS font string, e.g. "16px Georgia"
  width: number;       // px, editor column width
  lineHeight: number;  // e.g. 1.8
}

export interface MeasureResult {
  height: number;      // px
  lineCount: number;
}

export interface Measurer {
  measure(input: MeasureInput): MeasureResult;
}

export function createPretextMeasurer(): Measurer;
export function createCanvasMeasurer(): Measurer;  // fallback, not built in Phase 1
```

**Cache:** `measure.ts` exposes a memoized wrapper keyed on `(content_hash, font, width)`. Remeasuring on every scroll frame is a perf killer; remeasuring on content-or-width change is correct.

**Phase 1 scope:** Only `createPretextMeasurer()` is implemented. `createCanvasMeasurer()` is declared but its body throws `not implemented`. The interface shape is what matters — proving the wrapper can accommodate a swap if the `pretext` bet fails.

**Unit tests:**
- Empty string → returns fallback height (`DEFAULT_BLOCK_HEIGHT`)
- Single line of short text → `height ≈ lineHeight × fontSize`
- Text that wraps to N lines → height scales linearly with N
- Cache hit returns identical result without invoking the backend
- Cache invalidates when `content_hash` changes

### `engine/virtualizer.ts`

Pure function. No DOM, no Solid.

```typescript
export interface VirtualizerInput {
  blockHeights: number[];   // measured heights in order
  scrollTop: number;
  viewportHeight: number;
  overscan: number;         // extra blocks above/below, default 5
}

export interface VirtualizerOutput {
  firstIndex: number;
  lastIndex: number;
  offsetTop: number;        // px offset for the rendered slice
  totalHeight: number;      // px, full scroll height
}

export function computeVisible(input: VirtualizerInput): VirtualizerOutput;
```

The store calls this inside a `createMemo` keyed on `scrollTop` and `viewportHeight`. `ui/` reads the memoized result.

**Unit tests:**
- Empty input → `{ firstIndex: 0, lastIndex: -1, offsetTop: 0, totalHeight: 0 }`
- `scrollTop = 0` → returns first slice starting at index 0
- `scrollTop` past end → clamps correctly, no out-of-bounds
- Overscan expands the slice by N on both sides (clamped at boundaries)
- `totalHeight` equals the sum of `blockHeights`

### `engine/synthetic.ts`

Generates the perf harness document. Seeded PRNG so the same doc is produced every run (reproducible measurements).

```typescript
export function generateSyntheticDoc(opts: {
  chapterCount: number;        // 10
  blocksPerChapter: number;    // 50 → 500 blocks total
  wordsPerBlock: number;       // ~200
  typeDistribution: {
    text: number;               // 0.60
    dialogue: number;           // 0.25
    scene: number;              // 0.10
    note: number;               // 0.05
  };
  seed: number;
}): Document;
```

Content is lorem-ipsum-ish with realistic sentence-length distribution.

### Data flow on scroll (one frame)

```
user scrolls
  → Editor.tsx onScroll (rAF-throttled, one pending frame max)
  → setStore('viewport', { scrollTop, viewportHeight })
  → createMemo(computeVisible(...)) recomputes
  → <For each={visibleSlice()}> re-renders only affected blocks
  → BlockView reads memoized heights from the store
```

**No measurement happens on scroll.** Measurements are computed on content change, debounced 100ms, cached. Scrolling is pure math on cached numbers.

---

## UI Layer

### Layout (floating islands)

Three static islands over a neutral "sea": Sidebar (left), Editor (center), RightPanel (right stub). Each island uses `bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700`. 3-column grid, no resizing, no collapse — that's Phase 2+. `FpsOverlay` is rendered dev-only in the bottom-right.

### `Editor.tsx` (virtualized scroll container)

```tsx
const Editor = () => {
  let scrollEl!: HTMLDivElement;
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setStore('viewport', {
        scrollTop: scrollEl.scrollTop,
        viewportHeight: scrollEl.clientHeight,
      });
      ticking = false;
    });
  };

  const visible = createMemo(() => computeVisible({
    blockHeights: orderedHeights(),
    scrollTop: store.viewport.scrollTop,
    viewportHeight: store.viewport.viewportHeight,
    overscan: 5,
  }));

  return (
    <div ref={scrollEl} onScroll={onScroll} class="h-full overflow-auto font-serif">
      <div style={{ height: `${visible().totalHeight}px`, position: 'relative' }}>
        <div style={{ transform: `translateY(${visible().offsetTop}px)` }}>
          <For each={visibleSlice()}>
            {(block) => <BlockView block={block} />}
          </For>
        </div>
      </div>
    </div>
  );
};
```

Only the visible slice is in the DOM. The outer div carries total scroll height; the inner div is translated to the current offset. Standard virtualization, nothing exotic.

### `BlockView.tsx` — the contenteditable discipline

The core problem: if Solid re-renders a `<div contenteditable>` while the user is typing in it, the browser resets the cursor. The discipline that avoids this has four rules.

**Rule 1: Don't let Solid own the innerHTML of a focused block.**
While a block has focus, Solid does *not* write to its DOM. The DOM and the store are intentionally out of sync during editing.

```tsx
const BlockView = (props: { block: Block }) => {
  let el!: HTMLDivElement;
  let isFocused = false;
  let isComposing = false;

  onMount(() => { el.innerText = props.block.content; });

  createEffect(() => {
    const incoming = props.block.content;
    if (!isFocused && el.innerText !== incoming) {
      el.innerText = incoming;
    }
  });

  const commitDebounced = debounce(() => {
    if (isComposing) return;
    setStore('blocks', props.block.id, 'content', el.innerText);
  }, 300);

  const onFocus = () => { isFocused = true; };
  const onBlur = () => {
    isFocused = false;
    setStore('blocks', props.block.id, 'content', el.innerText);
  };

  const onCompositionStart = () => { isComposing = true; };
  const onCompositionEnd = () => {
    isComposing = false;
    commitDebounced();
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };

  return (
    <div
      ref={el}
      contentEditable
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={commitDebounced}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onPaste={onPaste}
      data-block-id={props.block.id}
      class={blockClass(props.block.type)}
    />
  );
};
```

**Rule 2: Content commits happen on blur + debounced during typing.** 300ms debounce. The store catches up during pauses, never mid-keystroke. Remeasurement triggers from the store update, so it's debounced too.

**Rule 3: Virtualization unmount is safe because `<For>` is keyed on `block.id`.** A block that scrolls out of view is unmounted. If the user was typing in it, they lose focus — which is correct (they scrolled away from their own cursor). Overscan of 5 means this practically never happens during normal editing.

**Rule 4: Keybindings are intercepted before contenteditable sees them.**
- `Enter` → `preventDefault`, insert a new `text` block below, focus it
- `Backspace at offset 0` → merge with previous block (concat content, delete this one, focus previous at end)
- `ArrowUp / ArrowDown at line boundary` → move focus to prev/next block
- Everything else → let contenteditable handle it natively

The keybinding layer is ~80 lines, lives in `BlockView` or a small `useBlockKeybindings` helper.

### Edge cases to handle explicitly

- **IME / composition events:** during composition, do not commit to store, do not remeasure. Critical for Hungarian diacritics.
- **Paste:** strip HTML, insert plain text via `document.execCommand('insertText', ...)`. Ugly but works.
- **Backspace on empty block:** deletes the block entirely (not a merge of empty content).

### Fallback tripwire

If the contenteditable discipline is still eating time at the end of week 4 with unresolved cursor-jump edge cases, drop to "dumb contenteditable" (no focus-aware skip, no debounced commit) and ship Phase 1 with the jank. Revisit the discipline in Phase 2. Do not let perfect editing kill the perf validation, which is the point of Phase 1.

---

## Perf Harness

A dedicated route at `/perf` that calls `generateSyntheticDoc()` and loads the result directly into the store, bypassing any UI for doc creation. The route renders the real `Editor` against the real engine and store.

**Measurements:**

1. **Scroll FPS** — mouse-wheel scroll from top to bottom of the 500-block doc. Chrome DevTools Performance panel. Report median FPS over the scroll interval.
2. **Input latency** — type a character into a block near the middle of the doc. Measure keydown → next paint. Target: <16ms.
3. **Initial render** — time from route mount to first meaningful paint with 500 blocks loaded. Target: <500ms. Only ~15 blocks are ever in the DOM at once (virtualized), so this should be trivial.
4. **Memory baseline** — DevTools heap snapshot after load. No hard target; just a recorded baseline for Phase 2 to regress-check against.

All measurements are recorded in `docs/perf-phase1.md` as the signed-off evidence for Criterion 1 and Criterion 2.

**`FpsOverlay`** is a dev-only Solid component reading `performance.now()` deltas in a `requestAnimationFrame` loop and displaying a rolling 60-frame average. Catches regressions during development without opening DevTools.

---

## Testing Strategy

**Unit tests** cover the engine layer only:
- `engine/measure.ts` — see unit test list above
- `engine/virtualizer.ts` — see unit test list above
- `engine/synthetic.ts` — determinism from seed, correct type distribution, correct block count

**UI tests:** none automated. Manual QA against a written checklist:
- Creating blocks with Enter
- Backspace-merging blocks
- Arrow-navigating between blocks
- Typing Hungarian text with diacritics
- Pasting plain text from clipboard
- Scrolling the `/perf` harness from top to bottom
- Toggling between dark and light mode

The perf harness route itself doubles as a regression guard for the whole stack.

---

## Timeline (5 weeks, solo, focused effort)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Engine layer | `types/`, `measure.ts` with `pretext` backend, `virtualizer.ts`, `synthetic.ts`, unit tests green |
| 2 | Perf harness + layout | `/perf` route, `Editor.tsx` virtualization, static read-only `BlockView`, floating-island layout, **first FPS measurement** |
| 3 | BlockView + keybindings | Contenteditable discipline, focus/blur commits, Enter / Backspace / Arrow navigation, `FpsOverlay` |
| 4 | Polish + IME + edge cases | Paste handling, composition events, empty-block edge cases, Hungarian test, dark mode, final perf measurement |
| 5 | Buffer / tripwire week | Finish anything lagging, or fall back to dumb contenteditable if the discipline is still broken |

**Key moment: end of week 2.** That is when the `pretext` + virtualization FPS question is answered. Pass → weeks 3–5 carry only execution risk. Fail → re-evaluate per ADR-002, activate Canvas fallback or pivot.

---

## Open Questions

None for Phase 1 as of this draft. All ambiguities surfaced during brainstorming have been resolved in favor of a concrete choice (approach, testing scope, contenteditable discipline, tripwire fallback).

---

## References

- `01-PROJECT-VISION.md` — project vision and philosophy
- `02-TECH-STACK.md` — stack rationale, especially `pretext` and virtualization
- `05-ROADMAP-AND-ADR.md` — Phase 1 goals, ADR-002 (`pretext` risk), ADR-006 (`contenteditable` is temporary)
- `06-CODING-GUIDELINES.md` — Solid.js patterns, file organization, naming conventions
- `CLAUDE.md` — session rules and non-negotiable constraints
