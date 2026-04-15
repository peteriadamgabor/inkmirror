# StoryForge — Development Roadmap & Architectural Decisions

---

## Phases

### Phase 1: Proof of Concept ✅ COMPLETE (2026-04-13)

**Goal:** Prove that the block-based editor runs at 60 FPS on the `pretext` + Solid.js stack.

**Deliverables:**
- [x] Project initialization (Vite + Solid.js + TypeScript + Tailwind)
- [x] TypeScript interfaces (Block, Chapter, Document)
- [x] Basic UI: floating island layout (sidebar + editor + right panel)
- [x] `pretext` integration: text measurement (pure JS over `measureText` — see ADR-002 note)
- [x] Block editor component (`contenteditable` — still temporary, see ADR-006)
- [x] Soft-delete infrastructure in the data model
- [x] Performance test: `/perf` route with 500 blocks / 100k words, 60 FPS confirmed

**Critical questions:**
- Is the `pretext` API stable enough for our needs?
- Do `contenteditable` and Solid.js reactivity work well together?
- Can we hold 60 FPS at 500 blocks?

**File structure:**
```
src/
├── types/
│   ├── block.ts          # Block, BlockType, BlockMetadata
│   ├── chapter.ts        # Chapter
│   ├── document.ts       # Document, DocumentSettings
│   └── index.ts          # barrel export
├── engine/
│   ├── measure.ts        # pretext wrapper / hook
│   └── virtualizer.ts    # block virtualization logic
├── store/
│   └── document.ts       # Solid.js createStore for AppState
├── ui/
│   ├── App.tsx           # main layout (floating island)
│   ├── Sidebar.tsx       # chapter navigation
│   ├── Editor.tsx        # block list + virtualization
│   ├── BlockView.tsx     # rendering of a single block
│   ├── RightPanel.tsx    # character + mood panel
│   └── Toolbar.tsx       # floating toolbar at the bottom
├── index.tsx
└── index.css             # Tailwind + global styles
```

---

### Phase 2: Editor + Database ✅ COMPLETE (2026-04-15)

**Goal:** A working, saveable editor with persistent storage and the graveyard visualization.

**Deliverables:**
- [x] Persistence (pivoted from SurrealDB Wasm to plain IDB via `idb` — see ADR-003)
- [x] CRUD operations on blocks (create, read, update, soft-delete)
- [x] Chapter navigation in the sidebar (create, rename, delete, auto-numbered)
- [x] Drag-and-drop block reordering (HTML5 DnD + hover gutter handle + drop indicator)
- [x] Scene block type + inline metadata editor (location / time / mood / cast)
- [x] Dead Text Graveyard (modal, restore individual blocks, content recovery via revision history)
- [x] Keystroke tracking Web Worker with WPM / burst / session metrics
- [x] Focus mode (hide panels + dim non-active blocks) and Zen mode (+ strip block chrome)

**Also shipped in Phase 2:** per-block revision history (IDB v5 `block_revisions` store, dedup + 20-cap), custom confirm modal + toast system, chapter delete with cascade-to-graveyard, book page types (cover / dedication / epigraph / acknowledgments / afterword) via `Chapter.kind`.

**File structure additions:**
```
src/
├── db/
│   ├── connection.ts     # SurrealDB Wasm initialization
│   ├── migrations.ts     # schema definitions
│   └── queries.ts        # common queries
├── ui/
│   ├── Graveyard.tsx     # graveyard view
│   ├── SceneEditor.tsx   # scene metadata editor
│   └── FocusMode.tsx     # focus mode wrapper
└── workers/
    └── pulse-tracker.ts  # keystroke collector worker
```

---

### Phase 3: AI + Characters ✅ COMPLETE (2026-04-14, minus 2 deferred items)

**Goal:** Local AI integration, character card system, and story pulse analysis.

**Deliverables:**
- [x] Transformers.js setup in a Web Worker with ring-buffer error tracking
- [x] Model selection + quantization (multilingual sentiment model)
- [x] Sentiment analysis per block, persisted in IDB v3 `sentiments` store
- [x] Story Pulse ECG visualization (horizontal timeline above the editor)
- [x] Character card CRUD with color palette, IDB v4 `characters` store
- [x] Character auto-detection in text with Unicode-aware word boundaries (Hungarian-friendly)
- [ ] **Inconsistency detection** (character description comparison) — deferred, needs a second AI pipeline
- [x] Mood heatmap (full novel view, proportional chapter bars)
- [x] Text sonification baseline (Tone.js + sentiment → chord mapping)
- [ ] **Rich moods via zero-shot classification** — deferred, needs bigger model

**Also shipped in Phase 3 follow-ups:** dialogue rework (speaker picker, live auto-detect, colored chat bubbles, scene cast filter, POV alignment, Tab-to-cycle, parentheticals, Fountain CONT'D), character deletion cascade to dialogue blocks.

**File structure additions:**
```
src/
├── ai/
│   ├── worker.ts         # AI Web Worker
│   ├── sentiment.ts      # sentiment analysis logic
│   ├── character-detect.ts # NER / character detection
│   └── consistency.ts    # inconsistency detection
├── ui/
│   ├── CharacterCard.tsx
│   ├── CharacterGraph.tsx  # relationship graph
│   ├── StoryPulse.tsx      # story ECG
│   ├── HeatMap.tsx         # mood heatmap
│   └── Sonification.tsx    # Tone.js controls
└── audio/
    ├── engine.ts           # Tone.js synth setup
    └── params.ts           # sentiment → sound parameter mapping
```

---

### Phase 4: Experience + Polish ⬅ CURRENT (non-AI items complete)

**Goal:** The "wow-factor" features, export, and fine-tuning the user experience.

**Deliverables:**
- [ ] **Ghost reader implementation** — AI, deferred
- [ ] **Character simulator** ("What if…") — AI, deferred
- [x] Plot timeline view (modal, scenes grouped by chapter with cast chips)
- [x] Writer pulse dashboard (WPM / burst / keys / session in the right panel)
- [ ] **Full text sonification engine** — baseline shipped, real-time ambient generation pending
- [x] Focus mode animations (grid column collapse + opacity fade)
- [x] Zen mode (strips block chrome, hides ECG, 15vh scroll padding)
- [x] Export: EPUB, DOCX, PDF, Fountain, Markdown, JSON (all via lazy-loaded dynamic imports)
- [x] PWA: Service Worker via vite-plugin-pwa, installable, offline-ready
- [x] Performance: `/perf` route hits 100k words at 60 FPS

**Also shipped in Phase 4:** block left-click context menu, shared confirm modal + toast system, global rebindable hotkeys with F1 settings + Ctrl+K command palette, block drag-and-drop, smart paste, Enter-splits-at-end, document metadata settings modal, block move flash animation, solid-icons swap, block types help modal.

---

### Phase 5: SaaS (if justified)

**Goal:** Monetization, user management, synchronization.

**Deliverables:**
- [ ] Clerk / Auth.js integration
- [ ] Stripe subscription (Free / Pro / Team)
- [ ] Cloudflare Workers + Pages deployment
- [ ] SurrealDB Cloud synchronization (E2E encrypted)
- [ ] R2 backup
- [ ] AI API proxy (Claude / OpenAI, opt-in)
- [ ] Landing page
- [ ] Onboarding flow

---

## Architectural Decisions Log (ADR)

### ADR-001: Why Solid.js and not React?

**Context:** The editor needs to run at 60 FPS at 100,000+ words.

**Decision:** Solid.js, with fine-grained reactivity.

**Rationale:** React's Virtual DOM diffing algorithm is O(n) in the number of components. When editing a single block, diffing the entire document tree is wasted work. Solid.js's signal-based system only updates the DOM elements that actually changed, which is O(1) with respect to the edited block.

**Risk:** Smaller ecosystem, fewer off-the-shelf components. Acceptable because we are building a custom UI.

---

### ADR-002: Why pretext and not native DOM Layout?

**Context:** At 100,000+ words, DOM Layout Reflow is the main bottleneck.

**Decision:** Use the `pretext` library for Canvas/Wasm-based text measurement.

**Rationale:** DOM Layout Reflow re-layouts every element, which is O(n) in the number of DOM elements. `pretext` measures on Canvas, which is isolated — measuring a single block does not affect the others.

**Risk:** `pretext` is an experimental project with an unstable API. Fallback plan: our own Canvas `measureText()` wrapper (see `src/engine/measure.ts`).

---

### ADR-003: Why plain IndexedDB (via `idb`) and not SurrealDB Wasm?

**Context:** The document structure is relational (chapter → block → character), and graph relationships are also needed in later phases.

**Decision:** Plain IndexedDB via the `idb` npm wrapper. Repository layer in `src/db/repository.ts` is the seam — internals can be swapped without touching callers.

**History:** This ADR originally chose **SurrealDB Wasm**, reasoning that hand-rolled relational queries would be complex and bug-prone and that SurrealQL + graph edges + full-text search would be "free." That bet did not survive first contact. Phase 2 implementation hit a confirmed upstream bug in `@surrealdb/wasm@3.0.3` (`surrealdb/indxdb#9`, `surrealdb/surrealdb.js#571`, both open): every `.use({namespace, database})` call throws an IndexedDB transaction error in every browser tested (Firefox, Vivaldi/Chromium, also reproduced by third parties in Chrome and Safari). The bug affects SurrealDB's own Surrealist tool against their cloud. Not fixable from our side.

**Rationale for plain IndexedDB:**
- **It actually works.** Mature, stable, every browser.
- **Phase 2's query needs are trivial.** One filter (`document_id` + `deleted_at IS NULL`) + one sort (`order_idx`). An IDB index + in-memory filter handles this in microseconds on the scale we care about.
- **The repository abstraction is the right seam.** Public API (`saveBlock`, `softDeleteBlock`, `loadDocument`, …) is unchanged. Store, UI, and boot code never knew we pivoted.
- **Bundle size dropped from ~12 MB (Wasm) + 219 KB JS to 92 KB total.** 100× smaller. Boot latency is now invisible.

**What we lose:** SurrealQL, graph traversal, full-text search. All Phase 3+ concerns. Character mentions and relationships (the main relational use case beyond blocks) will be handled in-memory against the Solid store for Phase 3, and if we outgrow that, we can revisit SurrealDB when the upstream bug is fixed — or pick a different relational/graph DB with a working browser story.

**Risk:** If Phase 3+ character/relationship queries become expensive, we'll need a secondary index strategy. Acceptable — we'll have real data at that point and can measure.

---

### ADR-004: Why is there no Python backend?

**Context:** The privacy promise: "Your novel never leaves your machine."

**Decision:** No server — everything runs in the browser. The SaaS layer is opt-in and E2E encrypted.

**Rationale:** An unpublished novel is the writer's most guarded treasure. Server-side processing — whether it's AI inference or even simple saving — breaks trust. The offline-first approach is not a compromise; it is the product's core value.

**Risk:** AI model size is limited (max ~100MB in the browser). Larger models are available opt-in via API in the SaaS layer.

---

### ADR-005: Why Clerk/Auth.js and not custom auth?

**Context:** User management is needed in the SaaS phase.

**Decision:** Clerk (initially), with the option to migrate to Auth.js.

**Rationale:** A custom auth system is complex, security-risky, and takes months to write. Clerk can be integrated in 15 minutes, is secure, and provides a nice UI. If user count justifies it (>10,000 MAU), it can be migrated to Auth.js for cost optimization.

---

### ADR-006: Why contenteditable in Phase 1?

**Context:** Phase 1 is the PoC, where text measurement and virtualization are the priority.

**Decision:** `<div contenteditable>` for editing blocks, as a temporary solution.

**Rationale:** The goal is to validate `pretext` + virtualization, not to finalize the editor. `contenteditable` is quick to implement and gives most basic features for free (cursor, selection, undo).

**Risk:** `contenteditable` is inconsistent across browsers. In Phase 2-3 we need to switch to custom input handling (Canvas-based cursor, or a ProseMirror-like input model).

---

## Performance Goals

| Metric | Goal | Measurement method |
|--------|------|--------------------|
| FPS while scrolling | 60 FPS | Chrome DevTools Performance |
| Block edit latency | <16ms | requestAnimationFrame timing |
| First load (TTI) | <2s | Lighthouse |
| SurrealDB Wasm init | <500ms | performance.now() |
| AI model load | <5s (first), <500ms (cache) | performance.now() |
| Word count threshold | 100,000+ words (500+ blocks) | Synthetic test document |

---

## Testing Strategy

### Synthetic Test Document
In Phase 1 a test document must be generated:
- 10 chapters
- 50 blocks / chapter (500 blocks total)
- Mixed types: 60% text, 25% dialogue, 10% scene, 5% note
- ~100,000 words (average 200 words / block)

### Performance Tests
- Scrolling at 500 blocks: FPS measurement
- Block editing at 500 blocks: input latency
- SurrealDB query time at 500 blocks
- Memory usage at 500 blocks

### Browser Compatibility
- Chrome (primary)
- Firefox
- Safari (WebKit — `pretext` Wasm compatibility is critical)
- Edge (Chromium — should be Chrome-compatible)
