# Phase 1 Plan 2: Editor Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only Plan 1 editor into a real writing experience. Make `BlockView` contenteditable with focus-aware reactivity that preserves cursor position across re-renders, add the Enter / Backspace-merge / arrow-navigation keybindings, handle IME composition + paste + empty-block edge cases, and take a final perf measurement that includes **input latency** (the metric Plan 1 deferred because it had no editing to measure).

**Architecture:** Build on the validated Plan 1 foundation (60 FPS, virtualization working, pretext wired). Introduce the four-rule contenteditable discipline in `BlockView.tsx`, a `useBlockKeybindings` helper (or inline handlers) for the keyboard commands, and a small store mutation layer (`createBlockAfter`, `mergeBlockWithPrevious`, `deleteBlock`, `updateBlockContent`) to back them. Also fix the Plan 1 observation that font metrics were wrong in headless by waiting on `document.fonts.ready` before any measurement.

**Tech Stack:** Same as Plan 1. No new runtime dependencies expected. `@testing-library/solid` may be added if we decide to unit-test BlockView keyboard behavior (optional).

---

## Scope of this plan (weeks 3–5 of the spec)

**In scope:**
- Font readiness: wait for `document.fonts.ready` before the first measurement pass
- BlockView contenteditable discipline (four rules: focus-aware sync, debounced/blur commits, keyed virtualization, intercepted keybindings)
- Keybindings: `Enter` (new block below), `Backspace` at offset 0 (merge with previous), `Arrow Up/Down` at block boundary (focus prev/next), `Backspace` on empty block (delete block entirely)
- Paste handling (strip HTML, insert plain text)
- Composition/IME handling (pause commits + remeasurement during `compositionstart`..`compositionend`)
- Store mutation layer for the above
- `data-scroll-root` attribute on the editor scroller (replaces the fragile class selector from Plan 1)
- Manual QA checklist document
- Updated `measure-perf.mjs` that also measures **input latency** by typing a key and timing keydown → next paint
- Final `docs/perf-phase1-final.md` with the full perf picture

**Out of scope for this plan (belongs to Phase 2+):**
- Drag-and-drop block reordering
- Dead Text Graveyard view (soft-delete exists in the type; no UI for it yet)
- SurrealDB, persistence, anything touching IndexedDB
- Real chapter CRUD (Phase 1 still has one hardcoded chapter for the normal editor route)
- AI / Web Workers / Tone.js
- Character cards, scene metadata editors
- Export of any kind
- Focus mode / Zen mode

---

## File Structure

Files created or modified in this plan:

```
/mnt/Development/StoryForge/
├── src/
│   ├── engine/
│   │   └── measure.ts                  # MODIFY: add waitForFontsReady() helper, export it
│   ├── store/
│   │   ├── document.ts                 # MODIFY: add updateBlockContent, createBlockAfter, mergeBlockWithPrevious, deleteBlock actions
│   │   └── document.test.ts            # CREATE: unit tests for the new mutation actions
│   ├── ui/
│   │   ├── blocks/
│   │   │   ├── BlockView.tsx           # REWRITE: read-only → contenteditable with four-rule discipline
│   │   │   └── keybindings.ts          # CREATE: pure keybinding logic (key → intent) extracted for testability
│   │   └── layout/
│   │       └── Editor.tsx              # MODIFY: add data-scroll-root attribute, wait for fonts.ready before measuring
│   └── routes/
│       └── editor.tsx                  # MODIFY: seed a small starter doc (1 chapter, 3 blocks) so / is actually writable
├── scripts/
│   └── measure-perf.mjs                # MODIFY: use data-scroll-root, add input-latency measurement pass
├── docs/
│   ├── perf-phase1-final.md            # CREATE: final measurement including input latency
│   └── qa-checklist-phase1.md          # CREATE: manual QA steps for the "feels right" success criterion
└── (no new root-level files)
```

---

## Task 1: Font readiness + data-scroll-root

Before anything else, fix the two issues Plan 1's measurement surfaced: block heights were undersized because Georgia hadn't loaded before pretext measured, and the scroll container was identified via a fragile class selector.

**Files:**
- Modify: `src/engine/measure.ts`
- Modify: `src/ui/layout/Editor.tsx`
- Modify: `scripts/measure-perf.mjs`

- [ ] **Step 1.1: Add `waitForFontsReady()` to `src/engine/measure.ts`**

Add this export after the existing `createMemoizedMeasurer` function:

```ts
/**
 * Resolves once the browser reports all @font-face fonts have finished loading.
 * pretext measurements depend on real font metrics — measuring before fonts are
 * ready produces incorrect heights (Plan 1 observed ~37px/block instead of ~490px
 * because Georgia hadn't loaded in headless Chromium).
 *
 * In non-browser environments (tests), resolves immediately.
 */
export async function waitForFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
}
```

- [ ] **Step 1.2: Gate Editor measurement on fonts.ready**

In `src/ui/layout/Editor.tsx`, import `waitForFontsReady` and wrap the measurement effect so it only runs once fonts are ready. The existing effect runs synchronously on every store change; we need a one-time async gate before the first measurement pass.

```tsx
import { createEffect, createMemo, createSignal, For, onMount } from 'solid-js';
import { BlockView } from '@/ui/blocks/BlockView';
import { computeVisible } from '@/engine/virtualizer';
import { createMemoizedMeasurer, createPretextMeasurer, waitForFontsReady } from '@/engine/measure';
import { store, setViewport, setMeasurement } from '@/store/document';
import type { Block } from '@/types';

// ... constants unchanged ...

const measurer = createMemoizedMeasurer(createPretextMeasurer());

// ... contentHash unchanged ...

export const Editor = () => {
  let scrollEl!: HTMLDivElement;
  let ticking = false;
  const [fontsReady, setFontsReady] = createSignal(false);

  onMount(async () => {
    await waitForFontsReady();
    setFontsReady(true);
  });

  createEffect(() => {
    if (!fontsReady()) return;
    const order = store.blockOrder;
    for (const id of order) {
      const block = store.blocks[id];
      if (!block) continue;
      const hash = contentHash(block.content);
      const cached = store.measurements[id];
      if (cached && cached.contentHash === hash) continue;
      try {
        const result = measurer.measure({
          text: block.content,
          font: EDITOR_FONT,
          width: EDITOR_WIDTH,
          lineHeight: LINE_HEIGHT,
        });
        setMeasurement(id, { height: result.height, contentHash: hash });
      } catch {
        setMeasurement(id, { height: 80, contentHash: hash });
      }
    }
  });

  // ... rest of the component unchanged except:
  // Add data-scroll-root="editor" to the outer scroll div:

  return (
    <div
      ref={scrollEl}
      onScroll={onScroll}
      data-scroll-root="editor"
      class="h-full overflow-auto bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700"
    >
      {/* inner divs unchanged */}
    </div>
  );
};
```

Apply the changes to the existing file — do not rewrite the whole component. The only diffs are (a) new imports, (b) the `fontsReady` signal and `onMount`, (c) the `if (!fontsReady()) return;` guard at the top of `createEffect`, (d) `data-scroll-root="editor"` on the outer scroll div.

- [ ] **Step 1.3: Update `measure-perf.mjs` to use `data-scroll-root`**

Replace the class-based selector in `scripts/measure-perf.mjs` with `document.querySelector('[data-scroll-root="editor"]')`. This touches three places: the `waitForFunction` body, the `page.evaluate(() => { ... state ... })` body, and the FPS `page.evaluate` body. The existing logic otherwise stays the same.

- [ ] **Step 1.4: Verify TS clean and tests green**

Run:
```bash
npx tsc --noEmit
npm test
```
Expected: clean, 20 passed / 1 skipped (no regression).

- [ ] **Step 1.5: Commit**

```bash
git add src/engine/measure.ts src/ui/layout/Editor.tsx scripts/measure-perf.mjs
git commit -m "fix: wait for fonts.ready before measuring, add data-scroll-root"
```

---

## Task 2: Store mutation actions

Before BlockView can write anything back, the store needs action functions for the operations Enter / Backspace-merge / arrow navigation will trigger. Pure, unit-testable.

**Files:**
- Modify: `src/store/document.ts`
- Create: `src/store/document.test.ts`

- [ ] **Step 2.1: Write failing tests first**

Create `src/store/document.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  setStore,
  loadSyntheticDoc,
  updateBlockContent,
  createBlockAfter,
  mergeBlockWithPrevious,
  deleteBlock,
} from './document';
import type { SyntheticDoc } from '@/engine/synthetic';
import type { Block, Chapter, Document } from '@/types';

function makeBlock(id: string, chapterId: string, order: number, content: string): Block {
  return {
    id,
    chapter_id: chapterId,
    type: 'text',
    content,
    order,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
}

function makeDoc(): SyntheticDoc {
  const chapter: Chapter = {
    id: 'ch1',
    document_id: 'd1',
    title: 'Chapter 1',
    order: 0,
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
  const document: Document = {
    id: 'd1',
    title: 'Test',
    author: 'Test',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
  return {
    document,
    chapters: [chapter],
    blocks: [
      makeBlock('b1', 'ch1', 0, 'first'),
      makeBlock('b2', 'ch1', 1, 'second'),
      makeBlock('b3', 'ch1', 2, 'third'),
    ],
  };
}

describe('document store mutations', () => {
  beforeEach(() => {
    // Reset by loading a fresh doc each test.
    loadSyntheticDoc(makeDoc());
  });

  describe('updateBlockContent', () => {
    it('updates content and leaves ordering intact', () => {
      updateBlockContent('b2', 'SECOND');
      expect(store.blocks['b2'].content).toBe('SECOND');
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });

    it('is a no-op for unknown ids', () => {
      updateBlockContent('nope', 'nope');
      expect(store.blocks['nope']).toBeUndefined();
    });
  });

  describe('createBlockAfter', () => {
    it('inserts a new empty text block after the given id', () => {
      const newId = createBlockAfter('b1');
      expect(store.blockOrder).toEqual(['b1', newId, 'b2', 'b3']);
      expect(store.blocks[newId].content).toBe('');
      expect(store.blocks[newId].type).toBe('text');
      expect(store.blocks[newId].chapter_id).toBe('ch1');
    });

    it('returns the id of the new block', () => {
      const newId = createBlockAfter('b3');
      expect(typeof newId).toBe('string');
      expect(newId.length).toBeGreaterThan(0);
      expect(store.blockOrder[store.blockOrder.length - 1]).toBe(newId);
    });
  });

  describe('mergeBlockWithPrevious', () => {
    it('concatenates content with the previous block and removes the merged block', () => {
      mergeBlockWithPrevious('b2');
      expect(store.blocks['b2']).toBeUndefined();
      expect(store.blocks['b1'].content).toBe('firstsecond');
      expect(store.blockOrder).toEqual(['b1', 'b3']);
    });

    it('returns the previous block id and the cursor offset (length of original previous content)', () => {
      const result = mergeBlockWithPrevious('b2');
      expect(result).toEqual({ previousId: 'b1', cursorOffset: 5 });
    });

    it('is a no-op at the first block', () => {
      const result = mergeBlockWithPrevious('b1');
      expect(result).toBeNull();
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });
  });

  describe('deleteBlock', () => {
    it('removes the block from blockOrder and blocks', () => {
      deleteBlock('b2');
      expect(store.blocks['b2']).toBeUndefined();
      expect(store.blockOrder).toEqual(['b1', 'b3']);
    });

    it('is a no-op for unknown ids', () => {
      deleteBlock('nope');
      expect(store.blockOrder).toEqual(['b1', 'b2', 'b3']);
    });
  });
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

Run: `npm test -- store`
Expected: module-not-found for the new exports (`updateBlockContent`, etc.).

- [ ] **Step 2.3: Implement the mutations**

Append to `src/store/document.ts` (do not modify existing exports):

```ts
import type { Block } from '@/types';

function uuid(): string {
  // crypto.randomUUID() is available in all modern browsers and Node 19+.
  // In Vitest (JSDOM), it's available via globalThis.crypto.
  return crypto.randomUUID();
}

export function updateBlockContent(blockId: UUID, content: string): void {
  if (!store.blocks[blockId]) return;
  const now = new Date().toISOString();
  setStore('blocks', blockId, (b) => ({ ...b, content, updated_at: now }));
}

/** Creates a new empty text block immediately after the given id. Returns the new id. */
export function createBlockAfter(blockId: UUID): UUID {
  const existing = store.blocks[blockId];
  if (!existing) throw new Error(`createBlockAfter: unknown block ${blockId}`);

  const newId = uuid();
  const now = new Date().toISOString();
  const newBlock: Block = {
    id: newId,
    chapter_id: existing.chapter_id,
    type: 'text',
    content: '',
    order: existing.order + 1,
    metadata: { type: 'text' },
    deleted_at: null,
    deleted_from: null,
    created_at: now,
    updated_at: now,
  };

  const idx = store.blockOrder.indexOf(blockId);
  const newOrder = [...store.blockOrder];
  newOrder.splice(idx + 1, 0, newId);

  setStore('blocks', newId, newBlock);
  setStore('blockOrder', newOrder);
  return newId;
}

/**
 * Merges the given block's content into the previous block and removes this block.
 * Returns { previousId, cursorOffset } where cursorOffset is where the caret should go
 * in the merged block (= length of the previous block's content BEFORE the merge).
 * Returns null if there is no previous block.
 */
export function mergeBlockWithPrevious(
  blockId: UUID,
): { previousId: UUID; cursorOffset: number } | null {
  const idx = store.blockOrder.indexOf(blockId);
  if (idx <= 0) return null;
  const previousId = store.blockOrder[idx - 1];
  const previous = store.blocks[previousId];
  const current = store.blocks[blockId];
  if (!previous || !current) return null;

  const cursorOffset = previous.content.length;
  const mergedContent = previous.content + current.content;

  updateBlockContent(previousId, mergedContent);
  deleteBlock(blockId);

  return { previousId, cursorOffset };
}

export function deleteBlock(blockId: UUID): void {
  if (!store.blocks[blockId]) return;
  const newOrder = store.blockOrder.filter((id) => id !== blockId);
  setStore('blockOrder', newOrder);
  setStore('blocks', blockId, undefined as unknown as Block);
}
```

Note the `undefined as unknown as Block` cast — Solid's `createStore` with a `Record<UUID, Block>` does not allow setting a key to undefined through its type signature. The cast is correct at runtime (Solid deletes the key) but the type system doesn't know that. If this feels wrong, the alternative is to use `produce` from `solid-js/store`:

```ts
import { produce } from 'solid-js/store';
// ...
setStore('blocks', produce((blocks) => { delete blocks[blockId]; }));
```

Use whichever approach the implementer prefers. Both are correct; `produce` is cleaner but adds an import.

- [ ] **Step 2.4: Run tests to confirm they pass**

Run: `npm test -- store`
Expected: all store tests pass.

- [ ] **Step 2.5: Run the full test suite**

Run: `npm test`
Expected: 28 passed, 1 skipped (20 from Plan 1 + 8 new store tests).

- [ ] **Step 2.6: Verify TS clean**

Run: `npx tsc --noEmit`
Expected: exits cleanly.

- [ ] **Step 2.7: Commit**

```bash
git add src/store/document.ts src/store/document.test.ts
git commit -m "feat(store): add updateBlockContent, createBlockAfter, mergeBlockWithPrevious, deleteBlock"
```

---

## Task 3: Keybinding logic (pure, unit-tested)

Extract keyboard intent resolution from `BlockView` into a pure module so it can be tested without a DOM. The component will call this on `keydown`, get back an `Intent` discriminated union, and then perform the corresponding store mutation + focus movement.

**Files:**
- Create: `src/ui/blocks/keybindings.ts`
- Create: `src/ui/blocks/keybindings.test.ts`

- [ ] **Step 3.1: Write failing tests first**

Create `src/ui/blocks/keybindings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveKeyIntent, type KeyContext } from './keybindings';

function ctx(overrides: Partial<KeyContext> = {}): KeyContext {
  return {
    key: 'a',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    caretOffset: 0,
    contentLength: 10,
    atFirstLine: false,
    atLastLine: false,
    ...overrides,
  };
}

describe('resolveKeyIntent', () => {
  it('returns null for normal typing keys', () => {
    expect(resolveKeyIntent(ctx({ key: 'a' }))).toBeNull();
    expect(resolveKeyIntent(ctx({ key: ' ' }))).toBeNull();
  });

  it('returns null while IME composition is active', () => {
    expect(resolveKeyIntent(ctx({ key: 'Enter', isComposing: true }))).toBeNull();
    expect(resolveKeyIntent(ctx({ key: 'Backspace', isComposing: true }))).toBeNull();
  });

  describe('Enter', () => {
    it('returns create-block-after intent', () => {
      expect(resolveKeyIntent(ctx({ key: 'Enter' }))).toEqual({ type: 'create-block-after' });
    });

    it('returns null for Shift+Enter (soft line break)', () => {
      expect(resolveKeyIntent(ctx({ key: 'Enter', shiftKey: true }))).toBeNull();
    });
  });

  describe('Backspace', () => {
    it('returns merge-with-previous intent at offset 0 with non-empty content', () => {
      expect(resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 0, contentLength: 5 }))).toEqual({
        type: 'merge-with-previous',
      });
    });

    it('returns delete-empty-block intent on an empty block', () => {
      expect(resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 0, contentLength: 0 }))).toEqual({
        type: 'delete-empty-block',
      });
    });

    it('returns null when caret is not at offset 0', () => {
      expect(
        resolveKeyIntent(ctx({ key: 'Backspace', caretOffset: 3, contentLength: 10 })),
      ).toBeNull();
    });
  });

  describe('Arrow navigation', () => {
    it('returns focus-previous on ArrowUp at the first line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowUp', atFirstLine: true }))).toEqual({
        type: 'focus-previous',
      });
    });

    it('returns null on ArrowUp when not at the first line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowUp', atFirstLine: false }))).toBeNull();
    });

    it('returns focus-next on ArrowDown at the last line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowDown', atLastLine: true }))).toEqual({
        type: 'focus-next',
      });
    });

    it('returns null on ArrowDown when not at the last line', () => {
      expect(resolveKeyIntent(ctx({ key: 'ArrowDown', atLastLine: false }))).toBeNull();
    });
  });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

Run: `npm test -- keybindings`
Expected: module-not-found.

- [ ] **Step 3.3: Implement `keybindings.ts`**

Create `src/ui/blocks/keybindings.ts`:
```ts
export interface KeyContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  caretOffset: number;
  contentLength: number;
  atFirstLine: boolean;
  atLastLine: boolean;
}

export type KeyIntent =
  | { type: 'create-block-after' }
  | { type: 'merge-with-previous' }
  | { type: 'delete-empty-block' }
  | { type: 'focus-previous' }
  | { type: 'focus-next' };

/**
 * Resolves a keyboard event's context into a block-level intent, or null if the
 * key should be handled by the browser's default contenteditable behavior.
 *
 * Returns null during IME composition — commits and navigation must wait until
 * composition ends so accented characters don't break.
 */
export function resolveKeyIntent(ctx: KeyContext): KeyIntent | null {
  if (ctx.isComposing) return null;

  if (ctx.key === 'Enter' && !ctx.shiftKey) {
    return { type: 'create-block-after' };
  }

  if (ctx.key === 'Backspace' && ctx.caretOffset === 0) {
    if (ctx.contentLength === 0) return { type: 'delete-empty-block' };
    return { type: 'merge-with-previous' };
  }

  if (ctx.key === 'ArrowUp' && ctx.atFirstLine) {
    return { type: 'focus-previous' };
  }

  if (ctx.key === 'ArrowDown' && ctx.atLastLine) {
    return { type: 'focus-next' };
  }

  return null;
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

Run: `npm test -- keybindings`
Expected: all keybinding tests pass.

- [ ] **Step 3.5: Verify TS clean and run full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, 39 passed / 1 skipped (previous 28 + 11 new keybinding tests).

- [ ] **Step 3.6: Commit**

```bash
git add src/ui/blocks/keybindings.ts src/ui/blocks/keybindings.test.ts
git commit -m "feat(ui): pure keybinding intent resolver with tests"
```

---

## Task 4: Rewrite BlockView with contenteditable discipline

The big one. Replace the read-only `BlockView` from Plan 1 with a contenteditable implementation that follows the four rules from the design spec:

1. Don't let Solid own the innerHTML of a focused block (skip the effect when `isFocused`)
2. Commits happen on blur + debounced on input (300ms)
3. Virtualization unmount is safe because `<For>` is keyed on `block.id`
4. Keybindings are intercepted before contenteditable sees them

Plus: composition events pause commits, paste strips HTML.

**Files:**
- Rewrite: `src/ui/blocks/BlockView.tsx`

- [ ] **Step 4.1: Read the current BlockView**

Run `cat src/ui/blocks/BlockView.tsx` to confirm the Plan 1 read-only version. You will be replacing it entirely.

- [ ] **Step 4.2: Rewrite `BlockView.tsx`**

Replace the entire file contents with:

```tsx
import { createEffect, onMount } from 'solid-js';
import type { Block } from '@/types';
import {
  updateBlockContent,
  createBlockAfter,
  mergeBlockWithPrevious,
  deleteBlock,
  store,
} from '@/store/document';
import { resolveKeyIntent, type KeyContext } from './keybindings';
import { debounce } from '@/utils/debounce';

const TYPE_LABELS: Record<Block['type'], { label: string; className: string }> = {
  text:     { label: 'TEXT',     className: 'text-violet-500' },
  dialogue: { label: 'DIALOGUE', className: 'text-teal-600' },
  scene:    { label: 'SCENE',    className: 'text-orange-600' },
  note:     { label: 'NOTE',     className: 'text-stone-400' },
};

const COMMIT_DEBOUNCE_MS = 300;

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let found = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        found = true;
        return true;
      }
      remaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  if (!found) {
    // Fall back to end of element.
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function isCaretAtFirstLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  // Within one line-height of the top.
  return caretRect.top - elRect.top < parseFloat(getComputedStyle(el).lineHeight || '30');
}

function isCaretAtLastLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  const caretRect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.bottom - caretRect.bottom < parseFloat(getComputedStyle(el).lineHeight || '30');
}

function focusBlock(blockId: string, caretPosition: 'start' | 'end' | number = 'start'): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-editable]`);
    if (!el) return;
    el.focus();
    const offset =
      caretPosition === 'start' ? 0 :
      caretPosition === 'end' ? (el.innerText?.length ?? 0) :
      caretPosition;
    setCaretOffset(el, offset);
  });
}

export const BlockView = (props: { block: Block }) => {
  let el!: HTMLDivElement;
  let isFocused = false;
  let isComposing = false;

  onMount(() => {
    el.innerText = props.block.content;
  });

  // Rule 1: skip DOM writes while the block is focused.
  createEffect(() => {
    const incoming = props.block.content;
    if (isFocused || isComposing) return;
    if (el && el.innerText !== incoming) {
      el.innerText = incoming;
    }
  });

  const commitDebounced = debounce(() => {
    if (isComposing) return;
    if (!el) return;
    updateBlockContent(props.block.id, el.innerText);
  }, COMMIT_DEBOUNCE_MS);

  const onFocus = () => {
    isFocused = true;
  };

  const onBlur = () => {
    isFocused = false;
    if (!el) return;
    updateBlockContent(props.block.id, el.innerText);
  };

  const onInput = () => {
    if (isComposing) return;
    commitDebounced();
  };

  const onCompositionStart = () => {
    isComposing = true;
  };

  const onCompositionEnd = () => {
    isComposing = false;
    commitDebounced();
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // execCommand is deprecated but still the simplest reliable way to insert
    // plain text at the cursor in contenteditable. Plan 2+ may replace with a
    // manual Range-based insertion.
    document.execCommand('insertText', false, text);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isComposing || e.isComposing) return;

    const caret = getCaretOffset(el);
    const len = el.innerText?.length ?? 0;
    const ctx: KeyContext = {
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      isComposing,
      caretOffset: caret,
      contentLength: len,
      atFirstLine: caret === 0 || isCaretAtFirstLine(el),
      atLastLine: caret === len || isCaretAtLastLine(el),
    };

    const intent = resolveKeyIntent(ctx);
    if (!intent) return;

    e.preventDefault();
    // Commit any pending debounced content before mutating structure.
    updateBlockContent(props.block.id, el.innerText);

    switch (intent.type) {
      case 'create-block-after': {
        const newId = createBlockAfter(props.block.id);
        focusBlock(newId, 'start');
        break;
      }
      case 'merge-with-previous': {
        const result = mergeBlockWithPrevious(props.block.id);
        if (result) focusBlock(result.previousId, result.cursorOffset);
        break;
      }
      case 'delete-empty-block': {
        const idx = store.blockOrder.indexOf(props.block.id);
        const previousId = idx > 0 ? store.blockOrder[idx - 1] : null;
        deleteBlock(props.block.id);
        if (previousId) focusBlock(previousId, 'end');
        break;
      }
      case 'focus-previous': {
        const idx = store.blockOrder.indexOf(props.block.id);
        if (idx > 0) focusBlock(store.blockOrder[idx - 1], 'end');
        break;
      }
      case 'focus-next': {
        const idx = store.blockOrder.indexOf(props.block.id);
        if (idx >= 0 && idx < store.blockOrder.length - 1) {
          focusBlock(store.blockOrder[idx + 1], 'start');
        }
        break;
      }
    }
  };

  const meta = () => TYPE_LABELS[props.block.type];

  return (
    <div class="py-2" data-block-id={props.block.id}>
      <div class={`text-[10px] uppercase tracking-wider font-medium mb-1 ${meta().className}`}>
        {meta().label}
      </div>
      <div
        ref={el}
        data-editable
        contentEditable
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100 whitespace-pre-wrap outline-none"
      />
    </div>
  );
};
```

- [ ] **Step 4.3: Verify TS clean**

Run: `npx tsc --noEmit`
Expected: clean. If there are errors about `document.execCommand`, add a `// @ts-expect-error deprecated but functional` comment above that line rather than chasing a type replacement.

- [ ] **Step 4.4: Run tests**

Run: `npm test`
Expected: 39 passed / 1 skipped. The BlockView has no unit tests — it's validated by the manual QA in Task 8 and the input-latency measurement in Task 9.

- [ ] **Step 4.5: Commit**

```bash
git add src/ui/blocks/BlockView.tsx
git commit -m "feat(ui): rewrite BlockView with contenteditable four-rule discipline"
```

---

## Task 5: Seed a starter doc on the `/` route

Plan 1's `/` route showed "No document loaded". For Plan 2, it needs a tiny real document you can actually write in — one chapter, three blocks, a reasonable starting point for manual QA.

**Files:**
- Modify: `src/routes/editor.tsx`

- [ ] **Step 5.1: Rewrite `editor.tsx`**

```tsx
import { onMount } from 'solid-js';
import { App } from '@/ui/App';
import { loadSyntheticDoc } from '@/store/document';
import type { SyntheticDoc } from '@/engine/synthetic';

function starterDoc(): SyntheticDoc {
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  return {
    document: {
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
    chapters: [
      {
        id: chapterId,
        document_id: docId,
        title: 'Chapter 1',
        order: 0,
        created_at: now,
        updated_at: now,
      },
    ],
    blocks: [
      {
        id: crypto.randomUUID(),
        chapter_id: chapterId,
        type: 'text',
        content: 'Start writing here. Press Enter for a new block.',
        order: 0,
        metadata: { type: 'text' },
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

export const EditorRoute = () => {
  onMount(() => loadSyntheticDoc(starterDoc()));
  return <App />;
};
```

- [ ] **Step 5.2: Verify TS clean + tests + boot**

Run:
```bash
npx tsc --noEmit
npm test
```
Expected: clean, 39 passed / 1 skipped.

- [ ] **Step 5.3: Commit**

```bash
git add src/routes/editor.tsx
git commit -m "feat(routes): seed a starter doc on / for manual QA"
```

---

## Task 6: Manual QA checklist document

The "editing feels right" success criterion is subjective. Write it down as a checklist so it can be executed deterministically.

**Files:**
- Create: `docs/qa-checklist-phase1.md`

- [ ] **Step 6.1: Create the checklist**

Create `docs/qa-checklist-phase1.md`:
```markdown
# Phase 1 Manual QA Checklist

Run against `npm run dev` → `http://localhost:5173/` (for editing feel) and `http://localhost:5173/perf` (for scrolling feel). Check every box before declaring Phase 1 done.

## Writing feel (the "5+ minute paragraph" test)

- [ ] Open `/`. Cursor blinks in the starter block.
- [ ] Type a full paragraph (at least 3 sentences). No cursor jumps, no dropped characters, no lag.
- [ ] After 5 minutes of continuous writing, the cursor is still where you expect. No character duplication. No silent data loss.

## Block structure keys

- [ ] `Enter` at the end of a block creates a new empty block below and moves the cursor into it.
- [ ] `Enter` in the middle of a block: currently not specified — document actual behavior (split vs. no-op).
- [ ] `Shift+Enter` inserts a soft line break inside the current block (does NOT create a new block).
- [ ] `Backspace` at offset 0 of a non-empty block merges it into the previous block. Cursor lands at the join point.
- [ ] `Backspace` on an empty block deletes it and moves the cursor to the end of the previous block.
- [ ] `Backspace` at offset 0 of the very first block is a no-op (no crash).
- [ ] `ArrowUp` on the first line of a block moves focus to the previous block (cursor at end).
- [ ] `ArrowDown` on the last line of a block moves focus to the next block (cursor at start).
- [ ] `ArrowUp` / `ArrowDown` within a multi-line block navigates within the block, not between blocks.

## IME / internationalization

- [ ] Type Hungarian text with diacritics: `árvíztűrő tükörfúrógép`. Every character appears correctly.
- [ ] During IME composition (e.g. dead-key accents), `Enter` and `Backspace` do NOT break the composition.
- [ ] After IME composition ends, the committed text is stored correctly.
- [ ] Test on at least one non-Latin IME if available (e.g. Japanese 日本語 via system IME). No crashes; composed text commits correctly.

## Paste

- [ ] Copy plain text from another app, paste into a block: text appears as plain text, no HTML leakage.
- [ ] Copy rich text (bold, links) from a browser, paste: appears as plain text, formatting stripped.
- [ ] Copy a multi-paragraph block, paste: currently inserts as one block with embedded newlines — document whether this is desired or whether paste should split into multiple blocks (Plan 3 decision).

## Virtualization under editing

- [ ] Open `/perf`. Scroll 500 blocks top to bottom. Smooth, no stuttering.
- [ ] Click into a block near the middle, type a word. No cursor jumps.
- [ ] Click into a block, type slowly over 30 seconds. No lag, no lost characters.
- [ ] Scroll away from the block you were editing and scroll back. Your edits are preserved (committed on blur).

## Visual / dark mode

- [ ] Toggle `dark` class on `<html>` in DevTools. Every island, border, and text color has a dark variant.
- [ ] Floating islands are visibly separated from the background on both themes.
- [ ] Block type labels (TEXT / DIALOGUE / SCENE / NOTE) are readable on both themes.

## Pass / fail

Phase 1 QA passes when every box above is checked. Any failure is either fixed in Plan 2 or explicitly deferred to Phase 2 with a written note.
```

- [ ] **Step 6.2: Commit**

```bash
git add docs/qa-checklist-phase1.md
git commit -m "docs: add Phase 1 manual QA checklist"
```

---

## Task 7: Input-latency measurement

Extend `measure-perf.mjs` with a second pass that measures the time from `keydown` to the next paint. Plan 1's measurement had no editing to measure; Plan 2 does.

**Files:**
- Modify: `scripts/measure-perf.mjs`

- [ ] **Step 7.1: Add an input-latency pass to `measure-perf.mjs`**

After the existing FPS measurement block, add another `page.evaluate` that:
1. Finds the first contenteditable block in the DOM
2. Focuses it
3. Records `performance.now()` on dispatching a `keydown` + `input` event sequence
4. Waits one `requestAnimationFrame` cycle + one microtask for paint
5. Records the delta

Concrete addition (append inside the `try {` block, after `fpsResults`):

```js
  const inputLatency = await page.evaluate(async () => {
    const editable = document.querySelector('[data-editable]');
    if (!editable) return { error: 'no editable block' };
    (editable as HTMLElement).focus();

    const samples = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      // Insert a character via execCommand (same path as real typing).
      document.execCommand('insertText', false, 'x');
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      const end = performance.now();
      samples.push(end - start);
    }

    const trimmed = samples.slice(5); // warm-up
    const sorted = [...trimmed].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return {
      sampleCount: trimmed.length,
      meanMs: mean,
      medianMs: median,
      p95Ms: p95,
      passedTarget: median < 16,
    };
  });
```

Note: `as HTMLElement` inside `page.evaluate` is TypeScript syntax; `measure-perf.mjs` is a `.mjs` file so strip the annotation and use `editable.focus()` directly. The file is plain JS, not TypeScript.

Then add `inputLatency` to the `result` object:

```js
  const result = {
    chromeVersion: await browser.version(),
    url: URL,
    initialNavigationMs: initialLoadMs,
    measurementsReadyMs,
    layoutState: state,
    fps: fpsResults,
    inputLatency,
    heapUsedMB: +(metrics.JSHeapUsedSize / (1024 * 1024)).toFixed(2),
    heapTotalMB: +(metrics.JSHeapTotalSize / (1024 * 1024)).toFixed(2),
  };
```

- [ ] **Step 7.2: Run the script**

Run:
```bash
npm run build
npx vite preview --port 4173 &
SERVER_PID=$!
sleep 2
node scripts/measure-perf.mjs > /tmp/perf-phase1-final.json
kill $SERVER_PID 2>/dev/null
cat /tmp/perf-phase1-final.json
```

Record the output. You will reference it in Task 8.

- [ ] **Step 7.3: Commit the script change**

```bash
git add scripts/measure-perf.mjs
git commit -m "feat(perf): add input-latency measurement to measure-perf script"
```

---

## Task 8: Final perf document

Write the final Phase 1 verdict doc combining Plan 1's scroll numbers with Plan 2's input-latency numbers and the QA checklist pass/fail.

**Files:**
- Create: `docs/perf-phase1-final.md`

- [ ] **Step 8.1: Create the final perf doc**

Create `docs/perf-phase1-final.md` using the same template as `docs/perf-phase1.md` but with the final numbers from Task 7's measurement, plus:
- A table row for input latency (target <16ms, measured value, pass/fail)
- A section titled "Manual QA outcome" that references `docs/qa-checklist-phase1.md` and records whether you actually ran it and what passed/failed
- A "Plan 2 outcome" section with a one-sentence verdict: does the full Phase 1 spec pass all exit criteria, yes or no?

The doc should be self-contained — a reader should be able to read only `perf-phase1-final.md` and understand whether Phase 1 is shippable.

- [ ] **Step 8.2: Run the manual QA checklist**

This is a manual step. Open `npm run dev`, walk through every box in `docs/qa-checklist-phase1.md`, record pass/fail in the final perf doc. If anything fails, you have two choices:

a) **Fix it inline** — add a remediation task to this plan, implement, re-QA
b) **Defer explicitly** — document the failure, mark it as a Phase 2 item, proceed

The tripwire from the spec: if the contenteditable discipline is producing unfixable cursor edge cases by the time you're running this QA, fall back to "dumb contenteditable" (remove the focus-aware sync rule, accept the jank), re-commit with a clear message, and document the fallback in the final perf doc.

- [ ] **Step 8.3: Commit the final doc**

```bash
git add docs/perf-phase1-final.md
git commit -m "docs: Phase 1 final perf verdict including input latency and manual QA"
```

---

## Known polish items to address in this plan

- **Smooth wheel scrolling.** After the ResizeObserver + anchoring fix (commit `b657ce6`), the virtualization math is stable but wheel scroll in Firefox feels "too fast" — raw per-pixel deltas with no interpolation. Fix options: `scroll-behavior: smooth` on `data-scroll-root="editor"`, or a wheel-delta accumulator that animates `scrollTop` over a short rAF window (~150ms). Pick whichever feels best when testing in real Firefox. Applies to Task 1 or a new micro-task appended after it.

---

## Plan 2 Exit Criteria

Plan 2 is complete when **all** of these hold:

- [ ] `npm test` runs all tests green (~40 tests / 1 skipped)
- [ ] `npx tsc --noEmit` produces no errors
- [ ] `npm run dev` boots `/` with a writable starter doc
- [ ] Typing a 5-minute paragraph in `/` feels natural (no cursor jumps, no lost characters)
- [ ] Enter / Backspace-merge / Arrow navigation all work correctly
- [ ] IME composition does not break accented characters
- [ ] Paste inserts plain text only
- [ ] Input latency < 16ms median (measured via `scripts/measure-perf.mjs`)
- [ ] Scroll FPS still ≥ 58 median at 500 blocks (no regression from Plan 1)
- [ ] Every box in `docs/qa-checklist-phase1.md` is checked
- [ ] `docs/perf-phase1-final.md` exists and records a clear pass/fail verdict

On pass: Phase 1 is shippable. Phase 2 (persistence, AI, chapter CRUD, graveyard) can begin.
On fail: either the fallback tripwire activates (dumb contenteditable) or a specific remediation task gets added and the cycle repeats.

---

## Self-Review Notes

**Spec coverage check (vs `docs/superpowers/specs/2026-04-12-phase1-poc-design.md`):**
- Contenteditable four-rule discipline → Task 4 ✓
- Enter / Backspace / Arrow keybindings → Task 3 (logic) + Task 4 (wiring) ✓
- IME composition handling → Task 4 ✓
- Paste handling → Task 4 ✓
- Empty-block backspace edge case → Task 3 (intent) + Task 4 (handler) ✓
- Manual QA against the "5+ minute paragraph" criterion → Task 6 + Task 8 ✓
- Input latency < 16ms measurement → Task 7 + Task 8 ✓
- Final FPS re-measurement (ensure no regression) → Task 8 ✓
- Data-scroll-root for test selectors (Plan 1 observation) → Task 1 ✓
- Font readiness (Plan 1 observation) → Task 1 ✓
- Tripwire fallback to "dumb contenteditable" → Task 8 Step 8.2 ✓

**Placeholder scan:** No TBDs. Task 4 has a `@ts-expect-error` hint for `execCommand`, which is a documented workaround not a placeholder. Task 8 has a "manual step" which is inherent to the "feels right" criterion and not avoidable.

**Type consistency:** `KeyContext`, `KeyIntent`, `Measurer`, `AppState` field names, action function signatures all consistent across tasks.

**Scope:** Plan 2 has 8 tasks (vs Plan 1's 14) because the foundation is already in place. Each task is focused and has clear exit criteria.
