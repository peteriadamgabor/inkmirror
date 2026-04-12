# StoryForge — Development Roadmap & Architectural Decisions

---

## Phases

### Phase 1: Proof of Concept ⬅ CURRENT

**Goal:** Prove that the block-based editor runs at 60 FPS on the `pretext` + Solid.js stack.

**Deliverables:**
- [ ] Project initialization (Vite + Solid.js + TypeScript + Tailwind)
- [ ] TypeScript interfaces (Block, Chapter, Document)
- [ ] Basic UI: floating island layout (sidebar + editor + right panel)
- [ ] `pretext` integration: text measurement with Canvas/Wasm
- [ ] Block editor component (`contenteditable` — temporary)
- [ ] Soft-delete infrastructure in the data model
- [ ] Performance test: 500 blocks, scrolling, FPS measurement

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

### Phase 2: Editor + Database

**Goal:** A working, saveable editor with SurrealDB and the graveyard visualization.

**Deliverables:**
- [ ] SurrealDB Wasm integration + IndexedDB persistence
- [ ] CRUD operations on blocks (create, read, update, soft-delete)
- [ ] Chapter navigation in the sidebar (create, rename, reorder)
- [ ] Drag-and-drop block reordering
- [ ] Scene block type + metadata editor
- [ ] Dead Text Graveyard visualization (floating island)
- [ ] Start keystroke tracking (Web Worker, data collection)
- [ ] Focus mode basics

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

### Phase 3: AI + Characters

**Goal:** Local AI integration, character card system, and story pulse analysis.

**Deliverables:**
- [ ] Transformers.js setup in a Web Worker
- [ ] Model selection and quantization (ONNX)
- [ ] Sentiment analysis per block (tension, pace, emotion)
- [ ] Story pulse ECG visualization
- [ ] Character card CRUD (create, edit, delete)
- [ ] Character auto-detection in text
- [ ] Inconsistency detection (character description comparison)
- [ ] Mood heatmap (full novel view)
- [ ] Text sonification baseline (Tone.js + sentiment)

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

### Phase 4: Experience + Polish

**Goal:** The "wow-factor" features, export, and fine-tuning the user experience.

**Deliverables:**
- [ ] Ghost reader implementation
- [ ] Character simulator ("What if...")
- [ ] Plot timeline view
- [ ] Writer pulse dashboard (long-term patterns, session summaries)
- [ ] Full text sonification engine (real-time ambient generation)
- [ ] Focus mode animations (islands sinking)
- [ ] Zen mode
- [ ] Export: EPUB, DOCX, PDF, Fountain, Markdown, JSON
- [ ] PWA: Service Worker, offline cache, installability
- [ ] Performance optimization: 100,000+ word test

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

### ADR-003: Why SurrealDB Wasm and not raw IndexedDB?

**Context:** The document structure is relational (chapter → block → character), and graph relationships are also needed.

**Decision:** SurrealDB Wasm, using IndexedDB as the storage engine.

**Rationale:** IndexedDB is a key-value store — building relational queries and graph traversal by hand would be complex and bug-prone. SurrealDB gives SQL, graph edges, and full-text search for free.

**Risk:** The size of SurrealDB Wasm (~2MB) and its memory footprint. Browser memory must be tested at 100,000+ words.

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
