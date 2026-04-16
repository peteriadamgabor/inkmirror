# InkMirror — Tech Stack

> Every technology decision serves a single goal: 60 FPS, 100,000+ words, zero server dependency.

---

## Architecture Overview

The app consists of four layers. Only the first two are required for it to work — the rest are opt-in.

```
┌─────────────────────────────────────────────────┐
│  UI LAYER (browser)                             │
│  Solid.js + TypeScript + Vite + Tailwind CSS    │
│  Tone.js (text sonification)                    │
├─────────────────────────────────────────────────┤
│  TEXT ENGINE LAYER                              │
│  pretext (Canvas/Wasm measurement)              │
│  Virtualization + Block system                  │
├─────────────────────────────────────────────────┤
│  DATA LAYER                                     │
│  SurrealDB Wasm → IndexedDB                     │
│  Soft-delete (Dead Text Graveyard)              │
├─────────────────────────────────────────────────┤
│  AI LAYER (local)                               │
│  Transformers.js (Web Worker, ONNX)             │
│  Sentiment engine + Character AI                │
└─────────────────────────────────────────────────┘
         ↓ opt-in, E2E encrypted ↓
┌─────────────────────────────────────────────────┐
│  EDGE LAYER (SaaS, serverless)                  │
│  Clerk/Auth.js + Stripe + CF Workers            │
├─────────────────────────────────────────────────┤
│  OPTIONAL BACKEND                               │
│  SurrealDB Cloud (sync)                         │
│  R2/S3 (E2E backup) + AI API proxy              │
└─────────────────────────────────────────────────┘
```

---

## 1. UI Layer

### Solid.js + TypeScript + Vite

| Property | Details |
|----------|---------|
| Framework | Solid.js (v1.x) |
| Language | TypeScript (strict mode) |
| Build tool | Vite |
| Package manager | pnpm (recommended) or npm |

**Why Solid.js and not React?**
Solid.js uses fine-grained reactivity without a Virtual DOM. When the user edits a block, only that block updates — the other 500 blocks remain untouched. In React, Virtual DOM diffing cannot do this as efficiently, which causes noticeable slowdowns at 100,000+ words.

**Principles:**
- No Virtual DOM — direct DOM manipulation via signals
- `createSignal()` for simple state
- `createStore()` for complex, nested state (document structure)
- `createMemo()` for derived values (word count, statistics)
- `createEffect()` for side effects (saving, triggering AI analysis)

### Tailwind CSS

Minimalist, floating island design. The background is neutral (`bg-stone-100` / `bg-stone-900` in dark mode), the panels are standalone "islands" (`bg-white rounded-2xl border border-stone-200`).

**Design tokens:**
```
Background:      bg-stone-100 (light) / bg-stone-900 (dark)
Island:          bg-white (light) / bg-stone-800 (dark)
Border:          border-stone-200 (light) / border-stone-700 (dark)
Rounding:        rounded-2xl (islands), rounded-lg (inner elements)
Writer color:    violet-500 (#7F77DD)
Story color:     orange-600 (#D85A30)
Text block:      violet-500 label
Dialogue block:  teal-600 label
Scene block:     orange-600 label
Note block:      stone-400 label
```

### Tone.js (Web Audio)

For the text sonification feature. Tone.js generates ambient sound with synthesizers and effects based on the emotional tone of the text.

**Usage:**
- Tense scene → deep drone, slow modulation
- Fast dialogue → rhythmic, snappy sound
- Calm description → airy pad, high frequencies
- The user can toggle it on/off and adjust the volume

---

## 2. Text Engine Layer

### pretext (Cheng Lou)

The project's most critical dependency. `pretext` is a Canvas/Wasm-based text measurement library that can report the exact dimensions of a text block (width, height, line breaks) without touching the DOM.

**Why is this needed?**
Traditional web editors rely on DOM Layout Reflow: they insert a `<div>` with the text, and the browser computes its size. At 100,000+ words this is catastrophically slow because the browser has to re-layout every element.

**How we use it:**
```typescript
// Pseudocode — the exact API depends on the pretext version
import { measure } from 'pretext';

const blockHeight = measure({
  text: block.content,
  font: '16px serif',
  width: editorWidth,    // the width of the editor column
  lineHeight: 1.8,
});
// We get back the exact height of the block in pixels,
// without having put anything into the DOM.
```

**Risk management:**
`pretext` is an experimental-stage project. If the API changes or development stops:
- **Fallback A:** Own Canvas `measureText()`-based measurement (less accurate but stable)
- **Fallback B:** Hidden off-screen DOM element measurement (slower but reliable)
- The measurement logic lives in a dedicated module (`src/engine/measure.ts`), the interface remains stable

### Virtualization

Only blocks visible in the viewport are inserted into the DOM. The other blocks' heights are known from the `pretext` measurement, and are replaced with placeholder `<div>`s.

```
┌──────────────────────┐
│ placeholder (320px)  │  ← pretext computed the height
│ placeholder (180px)  │
├──────────────────────┤
│ RENDERED BLOCK 42    │  ← this is actually in the DOM
│ RENDERED BLOCK 43    │
│ RENDERED BLOCK 44    │
│ RENDERED BLOCK 45    │
├──────────────────────┤
│ placeholder (240px)  │
│ placeholder (160px)  │
│ ... (400 more blocks)│
└──────────────────────┘
```

### Block System

Four block types:

| Type | Identifier | Description | Metadata |
|------|------------|-------------|----------|
| Text | `text` | Descriptive prose, plot | — |
| Dialogue | `dialogue` | Characters speaking | `speaker` (character ID) |
| Scene | `scene` | Scene-opening metadata | `location`, `time`, `characters[]`, `mood` |
| Note | `note` | Writer's comment, not exported | `color` (optional) |

---

## 3. Data Layer

### SurrealDB Wasm + IndexedDB

SurrealDB Wasm runs in the browser and uses IndexedDB as its storage engine. The two are not competitors — SurrealDB sits **on top of** IndexedDB as a smarter query layer.

**Why SurrealDB and not raw IndexedDB?**
- SQL-like queries (filtering, sorting blocks)
- Graph edges (character relationships: "Márton knows Réka")
- Full-text search (searching the entire novel)
- Built-in sync protocol (if it later becomes SaaS)

**Data model:**
```sql
-- Document
DEFINE TABLE document SCHEMAFULL;
DEFINE FIELD title ON document TYPE string;
DEFINE FIELD created_at ON document TYPE datetime;
DEFINE FIELD updated_at ON document TYPE datetime;

-- Chapter
DEFINE TABLE chapter SCHEMAFULL;
DEFINE FIELD document ON chapter TYPE record(document);
DEFINE FIELD title ON chapter TYPE string;
DEFINE FIELD order ON chapter TYPE int;

-- Block
DEFINE TABLE block SCHEMAFULL;
DEFINE FIELD chapter ON block TYPE record(chapter);
DEFINE FIELD type ON block TYPE string ASSERT $value IN ['text', 'dialogue', 'scene', 'note'];
DEFINE FIELD content ON block TYPE string;
DEFINE FIELD order ON block TYPE int;
DEFINE FIELD metadata ON block TYPE object;
DEFINE FIELD deleted_at ON block TYPE option<datetime>;  -- soft delete!
DEFINE FIELD deleted_from ON block TYPE option<string>;  -- where it was deleted from

-- Character
DEFINE TABLE character SCHEMAFULL;
DEFINE FIELD document ON character TYPE record(document);
DEFINE FIELD name ON character TYPE string;
DEFINE FIELD description ON character TYPE string;
DEFINE FIELD traits ON character TYPE array<string>;
DEFINE FIELD appearance ON character TYPE object;

-- Character relationship (graph edge)
DEFINE TABLE knows SCHEMAFULL TYPE RELATION FROM character TO character;
DEFINE FIELD relationship ON knows TYPE string;
DEFINE FIELD since_chapter ON knows TYPE option<record(chapter)>;
```

### Soft-delete (Dead Text Graveyard)

When deleted, the block's `deleted_at` field is set, but the data remains. The "graveyard" is a visual view that shows all deleted blocks, in chronological order, with chapter context.

```typescript
// Delete
await db.query(`UPDATE block:${id} SET deleted_at = time::now(), deleted_from = $chapter`);

// Graveyard query
await db.query(`SELECT * FROM block WHERE deleted_at IS NOT NONE ORDER BY deleted_at DESC`);

// Resurrect
await db.query(`UPDATE block:${id} SET deleted_at = NONE, deleted_from = NONE`);
```

---

## 4. AI Layer

### Transformers.js + Web Worker

AI models run in a dedicated Web Worker without blocking the main thread.

**Model strategy:**
- Small size: ~50-100MB quantized ONNX model
- Goal: sentiment analysis, NER (character detection), text comparison
- Model candidates: quantized Phi, TinyLlama, or a fine-tuned small model
- The model is cached in the browser (IndexedDB or Cache API)

**AI features:**

| Feature | Input | Output | Priority |
|---------|-------|--------|----------|
| Sentiment analysis | Block text | tension, pace, emotion score | Phase 3 |
| Character detection | Block text | Character names, mentions | Phase 3 |
| Inconsistency detection | Two blocks | Contradiction description | Phase 3 |
| Ghost reader | Chapter text | Reader experience simulation | Phase 4 |
| Character simulator | Character profile + situation | Reaction variants | Phase 4 |

**Worker communication:**
```typescript
// main thread
const aiWorker = new Worker('./ai-worker.ts', { type: 'module' });

aiWorker.postMessage({
  task: 'sentiment',
  payload: { text: block.content, blockId: block.id }
});

aiWorker.onmessage = (event) => {
  const { blockId, result } = event.data;
  // result: { tension: 0.8, pace: 0.3, emotion: 0.6 }
  updateBlockSentiment(blockId, result);
};
```

---

## 5. Edge Layer (SaaS — optional)

Only relevant if the app runs as SaaS. The app is 100% functional without SaaS.

### Authentication: Clerk or Auth.js

| Option | Pros | Cons |
|--------|------|------|
| Clerk | Hosted, zero-config, nice UI | Vendor lock-in, monthly fee |
| Auth.js | Open source, self-hosted | More setup work |

**Recommendation:** Clerk for a quick start (Phase 4+), migrate to Auth.js if user count justifies it.

### Payment: Stripe

Standard SaaS subscription model. Stripe Checkout Sessions are created by the Cloudflare Worker.

### Hosting: Cloudflare Workers + Pages

| Service | What it does |
|---------|--------------|
| CF Pages | Hosts the SPA (Solid.js app) |
| CF Workers | Auth token validation, Stripe webhook, AI API proxy |
| CF R2 | E2E encrypted backup storage |
| CF KV | Session cache, feature flags |

**No traditional backend.** No Python, no Node.js server, no PostgreSQL. The Cloudflare stack is serverless and edge-native.

---

## 6. Optional Backend Services

### Device sync: SurrealDB Cloud

The SurrealDB Wasm client natively syncs with SurrealDB Cloud. The sync is E2E encrypted — the server only sees encrypted blobs.

### Backup: Cloudflare R2

The IndexedDB contents are periodically exported, client-side encrypted, then uploaded to R2. The user can download their own backup at any time.

### AI API Proxy: Cloudflare Worker

If the user wants a larger AI model (e.g. Claude API), the Worker acts as a relay:
1. The client sends unencrypted text to the Worker (over HTTPS)
2. The Worker forwards it to the AI API
3. The response comes back to the client
4. The Worker stores nothing

**Important:** This is the only point where text leaves the browser as plaintext. The user explicitly grants permission and only the selected text is sent.

---

## Development Environment

```bash
# Initialization
pnpm create vite inkmirror -- --template solid-ts
cd inkmirror
pnpm add solid-js @solidjs/router
pnpm add -D tailwindcss @tailwindcss/vite typescript

# Later phases
pnpm add surrealdb.wasm         # Phase 2
pnpm add @xenova/transformers   # Phase 3
pnpm add tone                   # Phase 3-4
```

**TypeScript configuration:** strict mode, path aliases:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "paths": {
      "@/*": ["./src/*"],
      "@engine/*": ["./src/engine/*"],
      "@ui/*": ["./src/ui/*"],
      "@ai/*": ["./src/ai/*"]
    }
  }
}
```
