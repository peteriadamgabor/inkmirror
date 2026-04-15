# QA Checklist — Phase 4 wrap-up

Items from the backlog that can only run on a real browser or with
tools outside the test harness. Run these periodically; there's no
CI for any of them.

Last verified: **_not yet run against a real browser since the
Tier 1 UX arc landed._**

---

## 1. Bundle chunk sanity

**Goal:** confirm the heavy export libs are still isolated in
dynamic chunks and haven't leaked into the main bundle.

**How:**
```sh
node_modules/.bin/vite build
```

**Expected chunk layout** (2026-04-15 baseline):

| Chunk | Size raw | Size gzipped | Loaded |
|---|---|---|---|
| `index-*.js` (main) | ~212 KB | ~68 KB | always |
| `jszip.min-*.js` | 97 KB | 30 KB | on EPUB click |
| `index.es-*.js` (docx core) | 151 KB | 52 KB | on DOCX click |
| `index-*.js` (docx support) | 407 KB | 120 KB | on DOCX click |
| `jspdf.es.min-*.js` | 390 KB | 130 KB | on PDF click |
| `html2canvas.esm-*.js` | 201 KB | 48 KB | pulled by jspdf |
| `purify.es-*.js` | 23 KB | 9 KB | pulled by jspdf |
| `ai-worker-*.js` | 533 KB | ~150 KB | on AI preload |
| `ort-wasm-*.wasm` | ~22.8 MB | — | on AI run (cached by browser) |
| `pulse-tracker-*.js` | 0.76 KB | — | on first keystroke |

**Regression signal:** if the main `index-*.js` jumps past ~250 KB
raw, something imported a heavy dep statically. Chase it with
`vite build --mode analyze` and grep the module graph.

---

## 2. Real-Chrome / Firefox perf re-measurement

**Goal:** the roadmap claims "60 FPS at 100k words". Verify on a
human display (not headless Chromium).

**How:**
1. `npm run dev`
2. Navigate to `/perf` — seeds a 10-chapter / 50-blocks-per / 200-words-per synthetic document (~100k words).
3. Open DevTools → Performance → Record.
4. Smooth-scroll the editor top-to-bottom with the scroll wheel for 5–10 seconds.
5. Stop the recording.
6. Check the FPS graph in the "Frames" section. Expected: mostly green at 60 FPS. Any long red frames → investigate.
7. Check the "Main" flame graph for long tasks > 16 ms. Expected: most frames dominated by pretext measurement or Solid.js reactivity, none of them long enough to drop frames.

**Also check:** the FpsOverlay in the bottom-right corner of the editor shows a live FPS counter. Should stay green while scrolling.

---

## 3. Memory leak check

**Goal:** no leak from 10 minutes of continuous typing.

**How:**
1. `npm run dev`, open the default starter document.
2. DevTools → Memory → Take heap snapshot (baseline).
3. Type continuously for 10 minutes. Create blocks, edit them, delete some, restore from graveyard, toggle focus mode, etc.
4. Run GC (DevTools → Memory → trash can icon).
5. Take a second heap snapshot.
6. Compare deltas. Expected: steady allocations (~ a few MB for string growth, DOM nodes stable or bounded by the virtualizer).

**Red flags:**
- Solid.js reactivity objects growing linearly with keystrokes.
- `ResizeObserver` entries accumulating.
- IDB transactions not being released.
- Toasts / confirm modal / context menu host retaining DOM after dismiss.

---

## 4. EPUB validator pass

**Goal:** EPUBs exported from the app conform to EPUB3 spec.

**How:**
1. Install [`epubcheck`](https://github.com/w3c/epubcheck) —
   `brew install epubcheck` on macOS or grab the jar from the
   repo.
2. In the app, export any document as EPUB (Sidebar → Export → EPUB).
3. Run `epubcheck path/to/your-title.epub`.
4. Expected: zero errors. Warnings about missing cover image are
   expected (backlog item, not shipped) — anything else should be
   filed as a bug.

**Known expected warnings (as of 2026-04-15):**
- No cover image.
- No metadata.rights / metadata.publisher / metadata.date beyond
  the minimum required fields.

---

## 5. Shift+Enter soft newline

**Goal:** confirm pressing Shift+Enter inside a block inserts a
visible line break without splitting the block.

**How:**
1. Focus any block.
2. Type `first line`.
3. Press Shift+Enter.
4. Type `second line`.
5. Expected: both lines visible in the same block. The block count
   does not change. Store content round-trips as
   `"first line\nsecond line"` (verified by the unit test in
   `src/store/document.test.ts`).
6. Reload the page. Both lines should still be there.
7. Export as Markdown — both lines should appear in the same
   paragraph (with a literal `\n` between them).

**Known-working since:** the `whitespace-pre-wrap` class on the
contenteditable wrapper + the `resolveKeyIntent` returning `null`
for Shift+Enter in `src/ui/blocks/keybindings.ts`.

---

## 6. Spellcheck toggle round-trip

**Goal:** the spellcheck toggle in the RightPanel persists across
reloads.

**How:**
1. Focus a block, type a misspelled word → red squiggle visible.
2. Right panel → Spellcheck → off. Red squiggle disappears.
3. Reload. Squiggle still off.
4. Toggle back on. Squiggle returns.
5. Reload. Squiggle still on.

**Storage key:** `localStorage['storyforge.spellcheck']`, value `'0'` or `'1'`.

---

## 7. Hotkeys persistence

**Goal:** rebinding a hotkey survives reload and clashes swap.

**How:**
1. F1 → hotkey settings modal.
2. Click the combo pill next to "Focus mode".
3. Press `Alt+Shift+Q` (or any unused combo).
4. Expected: pill updates, a toast does not appear (no clash).
5. Trigger the new combo — focus toggles.
6. Reload. Combo still `Alt+Shift+Q`.
7. Click "Graveyard" → press `Alt+Shift+Q`.
8. Expected: toast "Swapped with 'Focus mode'". Graveyard now has
   `Alt+Shift+Q` and Focus has the previous Graveyard combo.
9. "Reset defaults" in the modal header → all combos return to
   their `BINDING_META.defaultCombo` values.

**Storage key:** `localStorage['storyforge.hotkeys']`, JSON object.
