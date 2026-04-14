# Phase 2 Persistence Foundation — Design Spec

**Date:** 2026-04-14
**Phase:** 2 (Editor + Database)
**Scope:** Persistence only — IndexedDB boot, schema, repository, store integration, first-run experience. Everything else in Phase 2 (drag-drop, chapter sidebar CRUD, graveyard UI, scene metadata editor, pulse worker, focus mode) is out of scope and will be covered in separate specs.

> **Pivot note (2026-04-14, mid-implementation):** This spec originally targeted SurrealDB Wasm per ADR-003. During implementation we hit a confirmed upstream bug in `@surrealdb/wasm@3.0.3` (`surrealdb/indxdb#9`, `surrealdb/surrealdb.js#571`) that makes `.use()` fail in every browser. ADR-003 was revised to plain IndexedDB via the `idb` package. The architecture, store integration, first-run behavior, and exit criteria all still apply as written — only the schema section and the queries in the data-flow diagram are now IDB object stores and `getAllFromIndex` calls instead of SurrealQL. See commit `375a14c` for the diff. The repository layer's public API is unchanged, which is why the pivot only touched `src/db/`.

---

## Goals

1. Refresh-safe editing: every keystroke that stops for 500ms is durable.
2. Honor ADR-003 (SurrealDB Wasm on IndexedDB) without fighting it.
3. Preserve Phase 1 perf: 60 FPS scroll, ≤16.7ms input latency.
4. Fix the existing soft-delete violation in `src/store/document.ts`.
5. Leave the schema ready for multi-document support later without breaking changes.

## Non-goals

- Multi-document picker UI (schema supports it; UI doesn't).
- Chapter CRUD UI (sidebar stays Phase 1 as-is).
- Drag-and-drop block reordering.
- Graveyard view.
- Writer pulse keystroke worker.
- Scene metadata editor.
- Cloud sync, multi-tab sync, LIVE SELECT.

---

## Decisions (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| 1 | Single-document-now, schema ready for multi-doc | Every row already has `document_id`; no UI cost; no future migration cost. |
| 2 | Debounced write-through (500ms), flush on blur + `beforeunload`; structural ops flush immediately | Matches existing BlockView commit pattern; keeps main thread quiet during typing bursts. |
| 3 | No LIVE SELECT | Single-writer app; the store is already the source of truth in memory; round-tripping own writes is waste. |
| 4 | First-run: auto-seed **empty** doc (one blank chapter, one blank text block) | Writer shows up and writes — no lorem content to delete. |
| 5 | Explicit repository layer (pattern A) | Matches `ui → store → db` layering rule; boring; testable; no reactive diff magic. |
| 6 | Fix `deleteBlock` to be true soft-delete as part of this spec | CLAUDE.md mandate; persistence + future graveyard both require it. |

---

## Architecture

New `src/db/` module owns SurrealDB. UI never imports from it. Store is the only caller.

```
src/db/
├── connection.ts     # getDb(): Promise<Surreal> — memoized, idempotent boot
├── migrations.ts     # schema definitions + version bookkeeping
├── repository.ts     # pure async functions: saveBlock, softDeleteBlock, ...
└── errors.ts         # error routing + in-memory ring buffer
```

**Boot sequence** (`src/main.tsx`):

1. `await getDb()` — blocks initial render (300-500ms budget per ADR-003).
2. `await repository.listDocuments()` → if empty, create empty starter (doc + chapter + one blank text block) and persist.
3. `await repository.loadDocument(id)` → hydrate store via the same shape as `loadSyntheticDoc`.
4. Mount `<App/>`.

**Splash:** minimal StoryForge wordmark + "loading…" during the boot await. No skeleton UI — too much design surface for a sub-second window.

---

## Schema

Three tables, all keyed by UUID (not SurrealDB auto-ids — IDs stay portable). Schema version stored in a `_meta` row.

```sql
DEFINE TABLE document SCHEMAFULL;
DEFINE FIELD id           ON document TYPE string;
DEFINE FIELD title        ON document TYPE string;
DEFINE FIELD author       ON document TYPE string;
DEFINE FIELD synopsis     ON document TYPE string;
DEFINE FIELD settings     ON document TYPE object;
DEFINE FIELD created_at   ON document TYPE datetime;
DEFINE FIELD updated_at   ON document TYPE datetime;

DEFINE TABLE chapter SCHEMAFULL;
DEFINE FIELD id           ON chapter TYPE string;
DEFINE FIELD document_id  ON chapter TYPE string;
DEFINE FIELD title        ON chapter TYPE string;
DEFINE FIELD order        ON chapter TYPE int;
DEFINE FIELD created_at   ON chapter TYPE datetime;
DEFINE FIELD updated_at   ON chapter TYPE datetime;
DEFINE INDEX chapter_doc  ON chapter FIELDS document_id;

DEFINE TABLE block SCHEMAFULL;
DEFINE FIELD id            ON block TYPE string;
DEFINE FIELD document_id   ON block TYPE string;   -- denormalized for fast doc loads
DEFINE FIELD chapter_id    ON block TYPE string;
DEFINE FIELD type          ON block TYPE string;
DEFINE FIELD content       ON block TYPE string;
DEFINE FIELD order         ON block TYPE int;
DEFINE FIELD metadata      ON block TYPE object;
DEFINE FIELD deleted_at    ON block TYPE option<datetime>;
DEFINE FIELD deleted_from  ON block TYPE option<object>;
DEFINE FIELD created_at    ON block TYPE datetime;
DEFINE FIELD updated_at    ON block TYPE datetime;
DEFINE INDEX block_doc     ON block FIELDS document_id;
DEFINE INDEX block_chapter ON block FIELDS chapter_id;
DEFINE INDEX block_grave   ON block FIELDS deleted_at;

DEFINE TABLE _meta SCHEMAFULL;
DEFINE FIELD key    ON _meta TYPE string;
DEFINE FIELD value  ON _meta TYPE any;
```

**Notes:**
- `document_id` is denormalized onto blocks so `loadDocument` is one indexed query, not a join.
- `metadata` is a free-form object matching the existing `BlockMetadata` discriminated union — typed at the TS layer, not the schema.
- Soft-deleted blocks stay in the table; `loadDocument` filters `WHERE deleted_at IS NONE`. Graveyard UI (future spec) queries the opposite.
- Schema version starts at 1. Migrations run if `_meta.schema_version < current`.

---

## Data flow

### Load (app boot)

```
getDb() → listDocuments()
  ├─ empty → create starter doc+chapter+block, persist
  └─ non-empty → pick first (single-doc-for-now)

loadDocument(id):
  SELECT * FROM document WHERE id = $id                        → doc
  SELECT * FROM chapter  WHERE document_id = $id ORDER BY order → chapters
  SELECT * FROM block    WHERE document_id = $id
                           AND deleted_at IS NONE
                           ORDER BY order                       → blocks

hydrate store (same shape as loadSyntheticDoc)
```

### Write path

| Mutation | Trigger | Timing |
|---|---|---|
| `updateBlockContent` | user typing | debounced 500ms per block; flush on blur and `beforeunload` |
| `createBlockAfter` | Enter mid-line | immediate |
| `mergeBlockWithPrevious` | Backspace at offset 0 | immediate (writes previous, soft-deletes current) |
| `deleteBlock` (→ soft-delete) | delete-empty-block intent | immediate |

Every write: `store mutation → repository call → tracked promise`. Store updates synchronously. Repo call is fire-and-forget into a `pendingWrites: Set<Promise>` pool. `beforeunload` awaits the pool with a short timeout (≤200ms).

**Reorder semantics:** `order` is a dense integer sequence. On insert/soft-delete, affected siblings in the same chapter are re-numbered and enqueued as multiple writes into the `pendingWrites` pool. Not wrapped in a SurrealDB transaction (Wasm build's transaction support is unverified — to be checked at implementation time and upgraded if trivial). Chapters have ~50 blocks; this is not a hot path.

**Crash window:** up to 500ms of typing can be lost. Accepted.

---

## Store changes

`src/store/document.ts`:

- `deleteBlock(blockId, from?)` becomes a **true soft-delete**: sets `deleted_at = now`, `deleted_from = { chapter_id, chapter_title, position }`, removes the id from `blockOrder`, but keeps the row in `store.blocks` (flagged). `<For>` iterates `blockOrder` so soft-deleted rows don't render.
  - Alternative considered: remove from `store.blocks` and keep only in DB. Rejected — graveyard UI and undo become expensive re-fetches.
- New exported action: `persistMutations: boolean` module-level flag (default true). Tests can disable it to drive the store in isolation.
- All mutation actions call the corresponding repository function after updating the store.

---

## Error handling

Four failure modes:

1. **DB init fails** (Wasm load, IndexedDB blocked, quota exhausted at boot). Hard error screen: *"StoryForge can't open its local database."* Retry button + copy-diagnostics link. No in-memory fallback — silently losing work is worse than refusing to start.
2. **Write fails mid-session** (quota exceeded, transaction aborted). Persistent toast: *"Changes not saving — your last edits are only in memory."* Store keeps unsaved state. Background retry every 5 seconds flushes the `pendingWrites` pool. No modal interrupts the writer.
3. **Schema version mismatch on load.** Migration runs. If migration throws, refuse to load — do not guess. Error screen with "report this" guidance.
4. **Corrupt row** (unexpected JSON in `metadata`, missing fields). Log warning, skip row, continue. A corrupt block is preferable to a blank editor.

**No retries on the happy path.** One attempt per write; if it fails, the toast path takes over. Retrying transparently hides real problems.

**Logging:** all DB errors flow through `db/errors.ts` → `console.error` in dev and an in-memory ring buffer exposed on `window.__storyforge_errors` for QA. No telemetry, no network.

---

## Testing

### Unit — repository (Vitest, mocked db)
- `saveBlock` produces correct SurrealQL.
- `softDeleteBlock` sets `deleted_at` + `deleted_from`, preserves row.
- `loadDocument` filters soft-deleted blocks.
- Schema migration is idempotent (run twice, same result).

Fake `db` object records queries. No real SurrealDB in unit tests. Fast, deterministic.

### Integration — store ↔ repository (Vitest + real SurrealDB Wasm + `fake-indexeddb`)
- Create doc, mutate blocks, reload store from DB, assert equality.
- Soft-delete roundtrip: delete block, reload; block gone from `blockOrder` but findable via direct query.
- Debounce correctness: 10 `updateBlockContent` calls in 100ms → exactly 1 write after 500ms.

**Fallback if SurrealDB Wasm refuses `fake-indexeddb`:** mark integration tests `.skip` in Node, run equivalents via Playwright against a real browser. Decision made at implementation time based on what works.

### Smoke — end-to-end (existing Playwright harness)
- Open `/`, type a sentence, reload, assert text persists.
- Create block via Enter, reload, assert new block present.
- Delete block via backspace-merge, reload, assert merge persisted.
- First-run empty DB → empty doc with one blank block.

### Performance gate
- Re-run `scripts/measure-perf.mjs` after persistence is wired.
- 60 FPS scroll + ≤16.7ms input latency must hold.
- Debounced writes must not spike the main thread.

---

## Risks and open questions

| Risk | Mitigation |
|---|---|
| SurrealDB Wasm boot >500ms budget | Measure early. If over budget, investigate lazy init (hydrate from cached snapshot while DB boots in background). Out of scope for first pass — fail loud if budget is missed. |
| SurrealDB Wasm incompatible with `fake-indexeddb` | Playwright fallback for integration tests. |
| SurrealDB Wasm API churn (young library) | Repository layer isolates queries; one file to patch. |
| Debounced writes queue grows unbounded during offline/quota-exhausted state | Pool is bounded by number of distinct blocks edited since last success; fine at one-user scale. |

---

## Exit criteria

1. Refresh on `/` preserves the last edit after 500ms of idle time.
2. `deleteBlock` is soft: row persists in DB with `deleted_at` set.
3. First-run on empty IndexedDB yields an empty doc with one blank block.
4. All unit tests pass. Integration tests pass or are skipped with a documented reason.
5. Smoke script runs green in headless Chromium.
6. `scripts/measure-perf.mjs` reports 60 FPS + ≤16.7ms input latency.
7. Manual Firefox check: type a paragraph, reload, content survives.
