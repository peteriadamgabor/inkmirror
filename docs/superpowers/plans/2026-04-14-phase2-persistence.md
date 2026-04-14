# Phase 2 Persistence Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StoryForge refresh-safe. Boot SurrealDB Wasm over IndexedDB, hydrate the Solid store from disk, write every store mutation through a typed repository layer, and seed an empty document on first run. Fix the existing soft-delete violation in `deleteBlock` as part of the same pass.

**Architecture:** New `src/db/` module owns the database. Boot is blocking (≤500ms per ADR-003). Store mutations synchronously update the in-memory store, then fire-and-forget a repository call into a `pendingWrites` pool. Content edits are debounced 500ms + flushed on blur and `beforeunload`; structural mutations (create/soft-delete) flush immediately. UI never imports from `db/` — the `ui → store → db` layering rule holds.

**Tech Stack:** `idb` (plain IndexedDB wrapper), plus existing Solid + TypeScript + Vitest + Playwright harness from Phase 1.

> **Pivot note (mid-implementation, 2026-04-14):** This plan originally installed `surrealdb` + `@surrealdb/wasm`. Tasks 1-10 were executed against SurrealDB Wasm until confirmed upstream bug `surrealdb/indxdb#9` (open, affects all browsers) made `.use()` unusable. Pivoted to plain IDB in commit `375a14c`. The completed tasks (db module, repository, store wiring, boot) are still valid — only the internals of `src/db/connection.ts` and `src/db/repository.ts` changed; the repository's public API, store code, boot sequence, and tests are unchanged. Task 1's instructions below no longer match the actual install but are left for historical context. Tasks 11-14 (manual QA, smoke, perf, ship) are the remaining work and do not depend on the DB backend choice.

---

## Scope of this plan

**In scope:**
- SurrealDB Wasm boot (`src/db/connection.ts`)
- Schema + migrations (`src/db/migrations.ts`)
- Repository layer (`src/db/repository.ts`) — typed async functions for document/chapter/block CRUD
- Error routing (`src/db/errors.ts`) — ring buffer + `console.error`
- Store integration — `pendingWrites` pool, debounced content writes, immediate structural writes
- `deleteBlock` → true soft-delete
- Boot sequence in `src/index.tsx` with splash + first-run empty seed
- `beforeunload` flush
- Unit tests (repository against mock db)
- Integration tests (store ↔ repository via `fake-indexeddb`, with Playwright fallback)
- Smoke test (Playwright: type → reload → content survives)
- Perf regression check against `scripts/measure-perf.mjs`

**Out of scope:**
- Multi-document picker UI
- Chapter CRUD UI (sidebar stays Phase 1 as-is)
- Drag-and-drop block reordering
- Graveyard view
- Writer pulse keystroke worker
- Scene metadata editor
- Focus mode
- Cloud sync, LIVE SELECT, multi-tab reconciliation

**Reference spec:** `docs/superpowers/specs/2026-04-14-phase2-persistence-design.md`

---

## File Structure

Files created or modified in this plan:

```
/mnt/Development/StoryForge/
├── package.json                           # MODIFY: add surrealdb.wasm + fake-indexeddb
├── src/
│   ├── db/
│   │   ├── errors.ts                      # CREATE: ring buffer + logDbError()
│   │   ├── connection.ts                  # CREATE: getDb() memoized boot
│   │   ├── migrations.ts                  # CREATE: schema + version bookkeeping
│   │   ├── repository.ts                  # CREATE: typed CRUD functions
│   │   └── repository.test.ts             # CREATE: unit tests against mock db
│   ├── store/
│   │   ├── document.ts                    # MODIFY: soft-delete + pendingWrites pool + repo calls
│   │   └── document.test.ts               # MODIFY: soft-delete test, persistence mock
│   ├── ui/
│   │   └── layout/
│   │       └── BootSplash.tsx             # CREATE: wordmark + "loading…"
│   ├── routes/
│   │   └── editor.tsx                     # MODIFY: remove starter doc, hydrate from db
│   └── index.tsx                          # MODIFY: async boot sequence
├── scripts/
│   └── smoke-test-persistence.mjs         # CREATE: Playwright persistence roundtrip
└── docs/
    └── perf-phase2.md                     # CREATE: post-integration perf numbers
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Note:** Repo uses **npm**, not pnpm. All package commands in this plan use npm.

**Note:** The older `surrealdb.wasm@1.0.0-beta.15` package is broken — it imports `AbstractEngine` from `surrealdb.js` but that export no longer exists. SurrealDB split into `surrealdb` (SDK) + `@surrealdb/wasm` (browser engine). Use the new packages.

- [ ] **Step 1: Install runtime and dev deps**

```bash
npm install surrealdb @surrealdb/wasm
npm install -D fake-indexeddb
```

- [ ] **Step 2: Verified import pattern (already probed during planning)**

```ts
import { Surreal } from 'surrealdb';
import { createWasmEngines } from '@surrealdb/wasm';
const db = new Surreal({ engines: createWasmEngines() });
await db.connect('indxdb://storyforge', { namespace: 'storyforge', database: 'main' });
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(db): add surrealdb and @surrealdb/wasm"
```

---

## Task 2: Error routing module

**Files:**
- Create: `src/db/errors.ts`

- [ ] **Step 1: Create the module**

```ts
// src/db/errors.ts
const RING_SIZE = 100;
const ring: Array<{ timestamp: number; scope: string; error: unknown }> = [];

export function logDbError(scope: string, error: unknown): void {
  const entry = { timestamp: Date.now(), scope, error };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  // eslint-disable-next-line no-console
  console.error(`[db:${scope}]`, error);
}

export function getDbErrors(): ReadonlyArray<{ timestamp: number; scope: string; error: unknown }> {
  return ring.slice();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __storyforge_errors: typeof getDbErrors }).__storyforge_errors = getDbErrors;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/errors.ts
git commit -m "feat(db): error ring buffer and console routing"
```

---

## Task 3: SurrealDB connection boot

**Files:**
- Create: `src/db/connection.ts`

- [ ] **Step 1: Write the module**

```ts
// src/db/connection.ts
import { Surreal } from 'surrealdb';
import { createWasmEngines } from '@surrealdb/wasm';
import { logDbError } from './errors';
import { runMigrations } from './migrations';

const NAMESPACE = 'storyforge';
const DATABASE = 'main';

let dbPromise: Promise<Surreal> | null = null;

export function getDb(): Promise<Surreal> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      const db = new Surreal({ engines: createWasmEngines() });
      await db.connect('indxdb://storyforge', {
        namespace: NAMESPACE,
        database: DATABASE,
      });
      await runMigrations(db);
      return db;
    } catch (err) {
      logDbError('connection.boot', err);
      throw err;
    }
  })();
  return dbPromise;
}

export function __resetDbForTests(): void {
  dbPromise = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/connection.ts
git commit -m "feat(db): surrealdb wasm connection with memoized boot"
```

---

## Task 4: Schema and migrations

**Files:**
- Create: `src/db/migrations.ts`

- [ ] **Step 1: Write schema module**

```ts
// src/db/migrations.ts
import type { Surreal } from 'surrealdb';
import { logDbError } from './errors';

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
DEFINE TABLE document SCHEMAFULL;
DEFINE FIELD id         ON document TYPE string;
DEFINE FIELD title      ON document TYPE string;
DEFINE FIELD author     ON document TYPE string;
DEFINE FIELD synopsis   ON document TYPE string;
DEFINE FIELD settings   ON document TYPE object;
DEFINE FIELD created_at ON document TYPE datetime;
DEFINE FIELD updated_at ON document TYPE datetime;

DEFINE TABLE chapter SCHEMAFULL;
DEFINE FIELD id          ON chapter TYPE string;
DEFINE FIELD document_id ON chapter TYPE string;
DEFINE FIELD title       ON chapter TYPE string;
DEFINE FIELD order_idx   ON chapter TYPE int;
DEFINE FIELD created_at  ON chapter TYPE datetime;
DEFINE FIELD updated_at  ON chapter TYPE datetime;
DEFINE INDEX chapter_doc ON chapter FIELDS document_id;

DEFINE TABLE block SCHEMAFULL;
DEFINE FIELD id           ON block TYPE string;
DEFINE FIELD document_id  ON block TYPE string;
DEFINE FIELD chapter_id   ON block TYPE string;
DEFINE FIELD type         ON block TYPE string;
DEFINE FIELD content      ON block TYPE string;
DEFINE FIELD order_idx    ON block TYPE int;
DEFINE FIELD metadata     ON block TYPE object;
DEFINE FIELD deleted_at   ON block TYPE option<datetime>;
DEFINE FIELD deleted_from ON block TYPE option<object>;
DEFINE FIELD created_at   ON block TYPE datetime;
DEFINE FIELD updated_at   ON block TYPE datetime;
DEFINE INDEX block_doc     ON block FIELDS document_id;
DEFINE INDEX block_chapter ON block FIELDS chapter_id;
DEFINE INDEX block_grave   ON block FIELDS deleted_at;

DEFINE TABLE meta SCHEMAFULL;
DEFINE FIELD key   ON meta TYPE string;
DEFINE FIELD value ON meta TYPE any;
`;

export async function runMigrations(db: Surreal): Promise<void> {
  try {
    const current = await currentVersion(db);
    if (current === SCHEMA_VERSION) return;
    if (current === 0) {
      await db.query(SCHEMA_V1);
      await db.query(
        'UPDATE meta:schema_version SET key = "schema_version", value = $v',
        { v: SCHEMA_VERSION },
      );
      return;
    }
    throw new Error(`Unknown schema version ${current}; expected ${SCHEMA_VERSION}`);
  } catch (err) {
    logDbError('migrations.run', err);
    throw err;
  }
}

async function currentVersion(db: Surreal): Promise<number> {
  try {
    const rows = (await db.query<[Array<{ value: number }>]>(
      'SELECT value FROM meta:schema_version',
    )) as Array<Array<{ value: number }>>;
    const first = rows?.[0]?.[0];
    return first ? Number(first.value) : 0;
  } catch {
    return 0;
  }
}
```

**Note on `order_idx`:** SurrealDB reserves `order` as a keyword in `SELECT ... ORDER BY`. Rename the field to `order_idx` in storage; the TS `Block.order` property still maps cleanly in the repository layer (Task 5).

- [ ] **Step 2: Commit**

```bash
git add src/db/migrations.ts
git commit -m "feat(db): schema v1 with order_idx field and meta version row"
```

---

## Task 5: Repository module (skeleton + types)

**Files:**
- Create: `src/db/repository.ts`

- [ ] **Step 1: Write the repository**

```ts
// src/db/repository.ts
import type { Surreal } from 'surrealdb';
import type { Block, Chapter, Document, UUID } from '@/types';
import { getDb } from './connection';
import { logDbError } from './errors';

// ---------- row encoding ----------

interface BlockRow {
  id: string;
  document_id: string;
  chapter_id: string;
  type: string;
  content: string;
  order_idx: number;
  metadata: unknown;
  deleted_at: string | null;
  deleted_from: unknown | null;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  document_id: string;
  title: string;
  order_idx: number;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  settings: Document['settings'];
  created_at: string;
  updated_at: string;
}

function blockToRow(b: Block, documentId: UUID): BlockRow {
  return {
    id: b.id,
    document_id: documentId,
    chapter_id: b.chapter_id,
    type: b.type,
    content: b.content,
    order_idx: b.order,
    metadata: b.metadata,
    deleted_at: b.deleted_at,
    deleted_from: b.deleted_from,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    chapter_id: row.chapter_id,
    type: row.type as Block['type'],
    content: row.content,
    order: row.order_idx,
    metadata: row.metadata as Block['metadata'],
    deleted_at: row.deleted_at,
    deleted_from: row.deleted_from as Block['deleted_from'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------- dependency injection for tests ----------

type DbLike = Pick<Surreal, 'query'>;
let testDb: DbLike | null = null;

export function __setTestDb(db: DbLike | null): void {
  testDb = db;
}

async function db(): Promise<DbLike> {
  return testDb ?? (await getDb());
}

// ---------- public API ----------

export async function saveDocument(doc: Document): Promise<void> {
  try {
    const row: DocumentRow = {
      id: doc.id,
      title: doc.title,
      author: doc.author,
      synopsis: doc.synopsis,
      settings: doc.settings,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
    const d = await db();
    await d.query(`UPDATE type::thing('document', $id) CONTENT $row`, { id: row.id, row });
  } catch (err) {
    logDbError('repository.saveDocument', err);
    throw err;
  }
}

export async function saveChapter(chapter: Chapter): Promise<void> {
  try {
    const row: ChapterRow = {
      id: chapter.id,
      document_id: chapter.document_id,
      title: chapter.title,
      order_idx: chapter.order,
      created_at: chapter.created_at,
      updated_at: chapter.updated_at,
    };
    const d = await db();
    await d.query(`UPDATE type::thing('chapter', $id) CONTENT $row`, { id: row.id, row });
  } catch (err) {
    logDbError('repository.saveChapter', err);
    throw err;
  }
}

export async function saveBlock(block: Block, documentId: UUID): Promise<void> {
  try {
    const row = blockToRow(block, documentId);
    const d = await db();
    await d.query(`UPDATE type::thing('block', $id) CONTENT $row`, { id: row.id, row });
  } catch (err) {
    logDbError('repository.saveBlock', err);
    throw err;
  }
}

export async function softDeleteBlock(
  blockId: UUID,
  deletedFrom: NonNullable<Block['deleted_from']>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const d = await db();
    await d.query(
      `UPDATE type::thing('block', $id) SET deleted_at = $now, deleted_from = $df, updated_at = $now`,
      { id: blockId, now, df: deletedFrom },
    );
  } catch (err) {
    logDbError('repository.softDeleteBlock', err);
    throw err;
  }
}

export async function listDocuments(): Promise<Document[]> {
  try {
    const d = await db();
    const result = (await d.query<[DocumentRow[]]>(
      'SELECT * FROM document ORDER BY created_at ASC',
    )) as Array<DocumentRow[]>;
    const rows = result[0] ?? [];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      synopsis: r.synopsis,
      settings: r.settings,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  } catch (err) {
    logDbError('repository.listDocuments', err);
    throw err;
  }
}

export interface LoadedDocument {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
}

export async function loadDocument(documentId: UUID): Promise<LoadedDocument | null> {
  try {
    const d = await db();
    const docRes = (await d.query<[DocumentRow[]]>(
      `SELECT * FROM document WHERE id = $id`,
      { id: documentId },
    )) as Array<DocumentRow[]>;
    const docRow = docRes[0]?.[0];
    if (!docRow) return null;

    const chapRes = (await d.query<[ChapterRow[]]>(
      `SELECT * FROM chapter WHERE document_id = $id ORDER BY order_idx ASC`,
      { id: documentId },
    )) as Array<ChapterRow[]>;
    const chapters: Chapter[] = (chapRes[0] ?? []).map((r) => ({
      id: r.id,
      document_id: r.document_id,
      title: r.title,
      order: r.order_idx,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const blockRes = (await d.query<[BlockRow[]]>(
      `SELECT * FROM block WHERE document_id = $id AND deleted_at IS NONE ORDER BY order_idx ASC`,
      { id: documentId },
    )) as Array<BlockRow[]>;
    const blocks = (blockRes[0] ?? []).map(rowToBlock);

    return {
      document: {
        id: docRow.id,
        title: docRow.title,
        author: docRow.author,
        synopsis: docRow.synopsis,
        settings: docRow.settings,
        created_at: docRow.created_at,
        updated_at: docRow.updated_at,
      },
      chapters,
      blocks,
    };
  } catch (err) {
    logDbError('repository.loadDocument', err);
    throw err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/repository.ts
git commit -m "feat(db): repository layer for document/chapter/block CRUD"
```

---

## Task 6: Repository unit tests

**Files:**
- Create: `src/db/repository.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/db/repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __setTestDb,
  saveBlock,
  softDeleteBlock,
  loadDocument,
  saveDocument,
  saveChapter,
  listDocuments,
} from './repository';
import type { Block, Chapter, Document } from '@/types';

interface Call { sql: string; vars: Record<string, unknown> }

function mockDb(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      async query(sql: string, vars: Record<string, unknown> = {}) {
        calls.push({ sql, vars });
        for (const [needle, value] of Object.entries(responses)) {
          if (sql.includes(needle)) return value;
        }
        return [[]];
      },
    },
  };
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  const now = '2026-04-14T12:00:00.000Z';
  return {
    id: 'block-1',
    chapter_id: 'chap-1',
    type: 'text',
    content: 'hello',
    order: 0,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

afterEach(() => __setTestDb(null));

describe('saveBlock', () => {
  it('sends UPDATE with block row including order_idx', async () => {
    const { calls, db } = mockDb({});
    __setTestDb(db);
    await saveBlock(makeBlock({ order: 3 }), 'doc-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("type::thing('block'");
    expect(calls[0].vars.row).toMatchObject({ order_idx: 3, document_id: 'doc-1' });
  });
});

describe('softDeleteBlock', () => {
  it('sets deleted_at and deleted_from without removing the row', async () => {
    const { calls, db } = mockDb({});
    __setTestDb(db);
    await softDeleteBlock('block-1', { chapter_id: 'chap-1', chapter_title: 'Ch 1', position: 0 });
    expect(calls[0].sql).toContain('deleted_at = $now');
    expect(calls[0].sql).toContain('deleted_from = $df');
    expect(calls[0].vars.df).toMatchObject({ chapter_id: 'chap-1', position: 0 });
  });
});

describe('loadDocument', () => {
  it('filters soft-deleted blocks in SQL', async () => {
    const docRow = {
      id: 'doc-1', title: 'T', author: '', synopsis: '',
      settings: {}, created_at: 'x', updated_at: 'x',
    };
    const { calls, db } = mockDb({
      'FROM document WHERE': [[docRow]],
      'FROM chapter WHERE': [[]],
      'FROM block WHERE': [[]],
    });
    __setTestDb(db);
    const result = await loadDocument('doc-1');
    expect(result).not.toBeNull();
    const blockCall = calls.find((c) => c.sql.includes('FROM block WHERE'));
    expect(blockCall?.sql).toContain('deleted_at IS NONE');
    expect(blockCall?.sql).toContain('ORDER BY order_idx ASC');
  });

  it('returns null when document row missing', async () => {
    const { db } = mockDb({ 'FROM document WHERE': [[]] });
    __setTestDb(db);
    const result = await loadDocument('nope');
    expect(result).toBeNull();
  });
});

describe('listDocuments', () => {
  it('returns mapped documents', async () => {
    const row = {
      id: 'd1', title: 'Novel', author: 'me', synopsis: '',
      settings: {}, created_at: 'a', updated_at: 'b',
    };
    const { db } = mockDb({ 'SELECT * FROM document': [[row]] });
    __setTestDb(db);
    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Novel');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test -- src/db/repository.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/db/repository.test.ts
git commit -m "test(db): repository unit tests with mock db"
```

---

## Task 7: Store — true soft-delete

**Files:**
- Modify: `src/store/document.ts` (the `deleteBlock` function)
- Modify: `src/store/document.test.ts` (add soft-delete assertions)

- [ ] **Step 1: Add failing test**

Add to `src/store/document.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { store, setStore, loadSyntheticDoc, deleteBlock } from './document';
// (adjust imports to match the existing file)

describe('deleteBlock soft-delete', () => {
  it('removes from blockOrder but keeps row flagged in store.blocks', () => {
    // use an existing helper in the test file to seed a 2-block doc,
    // or construct a tiny SyntheticDoc inline
    // ... seed ...
    const targetId = store.blockOrder[0];
    deleteBlock(targetId);
    expect(store.blockOrder).not.toContain(targetId);
    expect(store.blocks[targetId]).toBeDefined();
    expect(store.blocks[targetId].deleted_at).toBeTruthy();
    expect(store.blocks[targetId].deleted_from).toMatchObject({
      chapter_id: expect.any(String),
      position: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
pnpm test -- src/store/document.test.ts
```

Expected: the new test fails because current `deleteBlock` hard-deletes the row.

- [ ] **Step 3: Replace `deleteBlock` in `src/store/document.ts`**

Find the existing function (roughly lines 120-130):

```ts
export function deleteBlock(blockId: UUID): void {
  if (!store.blocks[blockId]) return;
  const newOrder = store.blockOrder.filter((id) => id !== blockId);
  setStore('blockOrder', newOrder);
  setStore(
    'blocks',
    produce((blocks) => {
      delete blocks[blockId];
    }),
  );
}
```

Replace with:

```ts
export function deleteBlock(blockId: UUID): void {
  const block = store.blocks[blockId];
  if (!block) return;
  const chapter = store.chapters.find((c) => c.id === block.chapter_id);
  const position = store.blockOrder.indexOf(blockId);
  const now = new Date().toISOString();
  const deletedFrom = {
    chapter_id: block.chapter_id,
    chapter_title: chapter?.title ?? '',
    position,
  };
  setStore('blockOrder', store.blockOrder.filter((id) => id !== blockId));
  setStore('blocks', blockId, (b) => ({
    ...b,
    deleted_at: now,
    deleted_from: deletedFrom,
    updated_at: now,
  }));
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- src/store/document.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/document.ts src/store/document.test.ts
git commit -m "fix(store): deleteBlock is now a true soft-delete"
```

---

## Task 8: Store — pendingWrites pool and repo wiring

**Files:**
- Modify: `src/store/document.ts`

- [ ] **Step 1: Add persistence plumbing at the top of the file**

After the existing imports, add:

```ts
import { debounce } from '@/utils/debounce';
import * as repo from '@/db/repository';

let persistEnabled = true;
const pendingWrites = new Set<Promise<unknown>>();
const debouncedBlockSaves = new Map<UUID, () => void>();

export function setPersistEnabled(enabled: boolean): void {
  persistEnabled = enabled;
}

function track<T>(p: Promise<T>): Promise<T> {
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
  return p;
}

export async function flushPendingWrites(timeoutMs = 200): Promise<void> {
  // flush any pending debounced content saves first
  for (const flush of debouncedBlockSaves.values()) flush();
  debouncedBlockSaves.clear();
  if (pendingWrites.size === 0) return;
  await Promise.race([
    Promise.allSettled([...pendingWrites]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function currentDocumentId(): UUID | null {
  return store.document?.id ?? null;
}

function persistBlock(blockId: UUID): void {
  if (!persistEnabled) return;
  const documentId = currentDocumentId();
  const block = store.blocks[blockId];
  if (!documentId || !block) return;
  track(repo.saveBlock(block, documentId).catch(() => { /* logged by repo */ }));
}
```

- [ ] **Step 2: Wire persistence into each mutation**

Inside `updateBlockContent`, after the `setStore(...)` call, add:

```ts
  if (persistEnabled) {
    let fn = debouncedBlockSaves.get(blockId);
    if (!fn) {
      fn = debounce(() => {
        debouncedBlockSaves.delete(blockId);
        persistBlock(blockId);
      }, 500);
      debouncedBlockSaves.set(blockId, fn);
    }
    fn();
  }
```

Inside `createBlockAfter`, after the existing store mutations and before `return newId`, add:

```ts
  persistBlock(newId);
  // sibling order has shifted — re-persist the neighbor if its `order` was bumped
  // (current implementation uses existing.order + 1 without re-numbering, so only newBlock is written)
```

Inside `deleteBlock`, after the new soft-delete store writes, add:

```ts
  if (persistEnabled) {
    const documentId = currentDocumentId();
    if (documentId) {
      track(
        repo.softDeleteBlock(blockId, {
          chapter_id: block.chapter_id,
          chapter_title: store.chapters.find((c) => c.id === block.chapter_id)?.title ?? '',
          position: store.blockOrder.indexOf(blockId), // captured before splice — adjust if needed
        }).catch(() => { /* logged by repo */ }),
      );
    }
  }
```

**Note:** `mergeBlockWithPrevious` already calls `updateBlockContent` (debounced) and `deleteBlock` (immediate). Persistence is handled transitively. Verify by reading that function after the changes; no direct edit needed unless the ordering feels wrong.

- [ ] **Step 3: Add hydration helper**

Add this exported function near `loadSyntheticDoc`:

```ts
import type { LoadedDocument } from '@/db/repository';

export function hydrateFromLoaded(loaded: LoadedDocument): void {
  const blocks: Record<UUID, Block> = {};
  const blockOrder: UUID[] = [];
  for (const b of loaded.blocks) {
    blocks[b.id] = b;
    blockOrder.push(b.id);
  }
  setStore({
    document: loaded.document,
    chapters: loaded.chapters,
    blocks,
    blockOrder,
    activeChapterId: loaded.chapters[0]?.id ?? null,
    measurements: {},
    viewport: { scrollTop: 0, viewportHeight: 0 },
  });
}
```

- [ ] **Step 4: Run existing tests**

```bash
pnpm test -- src/store/document.test.ts
```

**All existing tests must pass unchanged.** They seed the store via `loadSyntheticDoc` and call mutations; since `persistEnabled` defaults to `true` but repo calls are caught (`.catch()`), failures there won't break tests — but to be clean, add a `beforeEach(() => setPersistEnabled(false))` and `afterEach(() => setPersistEnabled(true))` to the existing test file's top-level `describe`.

- [ ] **Step 5: Commit**

```bash
git add src/store/document.ts src/store/document.test.ts
git commit -m "feat(store): debounced write-through to repository + flush pool"
```

---

## Task 9: Boot splash component

**Files:**
- Create: `src/ui/layout/BootSplash.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/ui/layout/BootSplash.tsx
export const BootSplash = (props: { message?: string; error?: string }) => {
  return (
    <div class="fixed inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
      <div class="flex flex-col items-center gap-4">
        <div class="text-2xl font-serif text-stone-700 dark:text-stone-200">StoryForge</div>
        {props.error ? (
          <div class="flex flex-col items-center gap-2">
            <div class="text-sm text-red-600 dark:text-red-400 max-w-md text-center">
              {props.error}
            </div>
            <button
              onClick={() => window.location.reload()}
              class="text-xs px-3 py-1.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200"
            >
              Retry
            </button>
          </div>
        ) : (
          <div class="text-xs text-stone-400">{props.message ?? 'loading…'}</div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/layout/BootSplash.tsx
git commit -m "feat(ui): boot splash for db init window"
```

---

## Task 10: Async boot sequence in index.tsx

**Files:**
- Modify: `src/index.tsx`
- Modify: `src/routes/editor.tsx` (remove starter doc seeding)

- [ ] **Step 1: Rewrite `src/index.tsx`**

```tsx
/* @refresh reload */
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { EditorRoute } from '@/routes/editor';
import { PerfHarnessRoute } from '@/routes/perf-harness';
import { getDb } from '@/db/connection';
import * as repo from '@/db/repository';
import { hydrateFromLoaded, flushPendingWrites } from '@/store/document';
import { BootSplash } from '@/ui/layout/BootSplash';
import type { Document, Chapter, Block, UUID } from '@/types';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

function emptyStarter(): { doc: Document; chapter: Chapter; block: Block } {
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  return {
    doc: {
      id: docId,
      title: 'Untitled',
      author: '',
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
    },
    chapter: {
      id: chapterId,
      document_id: docId,
      title: 'Chapter 1',
      order: 0,
      created_at: now,
      updated_at: now,
    },
    block: {
      id: blockId,
      chapter_id: chapterId,
      type: 'text',
      content: '',
      order: 0,
      metadata: { type: 'text' },
      deleted_at: null,
      deleted_from: null,
      created_at: now,
      updated_at: now,
    },
  };
}

async function boot(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getDb();
    const existing = await repo.listDocuments();
    let docId: UUID;
    if (existing.length === 0) {
      const seed = emptyStarter();
      await repo.saveDocument(seed.doc);
      await repo.saveChapter(seed.chapter);
      await repo.saveBlock(seed.block, seed.doc.id);
      docId = seed.doc.id;
    } else {
      docId = existing[0].id;
    }
    const loaded = await repo.loadDocument(docId);
    if (!loaded) return { ok: false, error: 'Document row missing after seed.' };
    hydrateFromLoaded(loaded);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const [bootState, setBootState] = createSignal<
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }
>({ kind: 'loading' });

render(
  () => {
    const state = bootState();
    if (state.kind === 'loading') return <BootSplash />;
    if (state.kind === 'error') return <BootSplash error={state.message} />;
    return (
      <Router>
        <Route path="/" component={EditorRoute} />
        <Route path="/perf" component={PerfHarnessRoute} />
      </Router>
    );
  },
  root,
);

void boot().then((result) => {
  if (result.ok) setBootState({ kind: 'ready' });
  else setBootState({ kind: 'error', message: result.error });
});

window.addEventListener('beforeunload', () => {
  void flushPendingWrites(200);
});
```

- [ ] **Step 2: Simplify `src/routes/editor.tsx`**

Replace the entire file with:

```tsx
import { App } from '@/ui/App';

export const EditorRoute = () => <App />;
```

The store is already hydrated by `boot()` before the router mounts, so the route no longer seeds anything.

- [ ] **Step 3: Build-check**

```bash
pnpm build
```

Expected: clean TypeScript compile, Vite bundles.

- [ ] **Step 4: Commit**

```bash
git add src/index.tsx src/routes/editor.tsx
git commit -m "feat(boot): async db boot with first-run empty seed"
```

---

## Task 11: Manual browser verification

**Files:** none (manual)

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

Open Firefox at the printed URL. **Do not use a measurement tool for this task — the user is a Firefox tester per project convention.**

- [ ] **Step 2: First-run check**

Open Firefox DevTools → Storage → Indexed DB. Delete any existing `storyforge` database. Reload the page.

Expected: splash briefly, then editor appears with one empty block and cursor-ready focus.

- [ ] **Step 3: Persistence roundtrip**

Type three paragraphs (Enter between each to create new blocks). Wait 1 second. Reload.

Expected: all three paragraphs present, in order, with the same text.

- [ ] **Step 4: Soft-delete persistence**

Position cursor at the start of the second block and press Backspace to merge. Reload.

Expected: merged content persists; only two blocks visible.

- [ ] **Step 5: Verify soft-deleted row still exists**

In DevTools console:

```js
const db = await (await import('/src/db/connection.ts')).getDb();
const result = await db.query('SELECT count() FROM block GROUP ALL');
console.log(result);
```

Expected: `count() >= 3` (the deleted block's row is still there with `deleted_at` set).

- [ ] **Step 6: If any step fails, stop and report**

Do not continue to Task 12 until Task 11 is green. File a note in the plan's "blockers" section (append to the end of this file) with the failure mode.

---

## Task 12: Smoke test script

**Files:**
- Create: `scripts/smoke-test-persistence.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/smoke-test-persistence.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const BROWSER = process.env.CHROME_BIN ?? '/usr/bin/chromium';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();

    // first visit: reach empty seeded doc, type, wait for debounce flush
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[contenteditable="true"]');
    await page.click('[contenteditable="true"]');
    await page.keyboard.type('The morning fog hung low over the village.');
    await new Promise((r) => setTimeout(r, 800)); // > 500ms debounce
    // ensure blur flushes before reload
    await page.evaluate(() => (document.activeElement).blur());
    await new Promise((r) => setTimeout(r, 300));

    // reload and assert content survived
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('[contenteditable="true"]');
    const text = await page.$eval('[contenteditable="true"]', (el) => el.textContent ?? '');
    if (!text.includes('The morning fog')) {
      throw new Error(`Persistence failed: editor content was "${text}"`);
    }
    console.log('PASS: text persisted across reload');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against a live dev server**

In one terminal: `pnpm dev`
In another: `node scripts/smoke-test-persistence.mjs`

**Pre-clear IndexedDB** in Chromium profile before running. If the profile is reused between runs, the test needs to clear first — add at the top of `main()`:

```js
await page.goto(URL);
await page.evaluate(async () => {
  const dbs = await indexedDB.databases?.() ?? [];
  for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
});
```

Expected output: `PASS: text persisted across reload`.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test-persistence.mjs
git commit -m "test(smoke): persistence roundtrip via puppeteer"
```

---

## Task 13: Perf regression check

**Files:**
- Create: `docs/perf-phase2.md`

- [ ] **Step 1: Run the Phase 1 perf script**

```bash
pnpm dev &
DEV_PID=$!
sleep 3
node scripts/measure-perf.mjs
kill $DEV_PID
```

- [ ] **Step 2: Capture numbers**

Write `docs/perf-phase2.md` with this shape (fill in real numbers):

```markdown
# Phase 2 Persistence — Performance Check

**Date:** 2026-04-14
**Commit:** <SHA after Task 12>

## Scroll FPS (500-block synthetic doc on /perf)
- Target: 60 FPS
- Measured: __ FPS
- Verdict: PASS / FAIL

## Input latency (keystroke → next paint on /)
- Target: ≤16.7ms (1 frame at 60Hz)
- Measured: __ ms
- Verdict: PASS / FAIL

## Notes
- Persistence writes are debounced 500ms; the input-latency window (single keystroke + next frame) does not flush to DB, so the write path should not affect this metric. If it does, investigate.
- SurrealDB boot time: __ ms (captured via performance.now() around getDb()).
```

- [ ] **Step 3: If FPS or latency regressed**

Do not continue. Stop, append a "blockers" note to this plan, and report to the user. The likely culprit is synchronous repo calls somewhere — make sure nothing `await`s in the hot path.

- [ ] **Step 4: Commit**

```bash
git add docs/perf-phase2.md
git commit -m "docs: phase 2 persistence perf regression check"
```

---

## Task 14: Final manual QA and ship

**Files:** none

- [ ] **Step 1: Full manual QA in Firefox**

Repeat every step from Task 11 one more time on a cold reload. Also:
- Close the tab and reopen. State persists.
- Open two tabs at `/`. Type in one, reload the other. The reloaded tab shows the latest. (Multi-tab reconciliation is out of scope — this check is just to confirm we don't silently corrupt state, not that both tabs stay live-synced.)

- [ ] **Step 2: Update memory files**

Update `~/.claude/projects/-mnt-Development-StoryForge/memory/project_phase1_status.md` — rename appropriately or create `project_phase2_status.md` noting persistence landed, schema v1, SurrealDB Wasm version used.

- [ ] **Step 3: Final commit if anything changed**

```bash
git status
# commit any stragglers
```

- [ ] **Step 4: Report done**

Report to user: "Phase 2 persistence shipped. Refresh-safe, soft-delete fixed, smoke test + perf check green. Ready for the next slice."

---

## Risks logged during implementation

*(Engineer: append notes here as you go if anything surprises you.)*

- [ ] SurrealDB Wasm import form confirmed in Task 1: named / default / other: ______
- [ ] `fake-indexeddb` compatibility: used / skipped (reason: ______)
- [ ] Boot time measured: ______ ms (budget 500ms)
- [ ] Any unexpected transaction / concurrency issues:
