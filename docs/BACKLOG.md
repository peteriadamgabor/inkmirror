# StoryForge Backlog

Informal list of ideas captured during development. Not a roadmap — the real roadmap lives in `05-ROADMAP-AND-ADR.md`. Items here are "worth considering when we get there," not commitments.

## UI polish

- **Smooth wheel scrolling** in the editor. Currently raw per-pixel delta; feels fast in Firefox. Options: `scroll-behavior: smooth` on `[data-scroll-root="editor"]`, or a wheel-delta accumulator animating `scrollTop` over ~150ms of rAF. (Noted in Plan 2 already.)
- **Spellcheck toggle.** Browser's red squiggles are on by default. Add `spellcheck={false}` on the editable div, or make it a user setting alongside the theme toggle.
- **RightPanel fleshing out.** Currently just the theme toggle. Natural homes for: document stats (word count, session time), block type filter, upcoming pulse visualizations.

## Paste & rich text (the wiki-paste problem)

Observed: pasting from a wiki page loses the wiki's formatting (intended) but also loses paragraph structure — everything becomes one long block. Three options, in increasing cost:

1. **Smart paste** *(highest value, lowest cost)*. Detect `\n\n` (or `\n`) in the pasted plain text and split into multiple blocks automatically. Preserves the block-based philosophy. Makes pasting a wiki article feel natural — you get several `text` blocks, one per paragraph. ~30 lines in `BlockView.onPaste`.
2. **Minimal inline formatting**. Bold and italic only, stored as marks on the `Block` type, `Cmd+B` / `Cmd+I` keybindings. No ProseMirror. ~1–2 days of work including cursor-safety around mark boundaries.
3. **Full rich text**. Adopt ProseMirror or Lexical. Rewrite `BlockView`. Gains: tables, links, inline code, undo history, real selection tracking. Costs: ~200 KB bundle, multi-week rewrite, loses the "we own every pixel" feeling. Not recommended unless a specific use case demands it.

**Recommendation:** do (1) whenever it annoys you enough. (2) and (3) are Phase 4+ material.

## Editor experience

- **Enter in the middle of a block**: currently creates a new empty block below and leaves the caret in the old block. Should probably split the block — text before the caret stays, text after moves to the new block. ~20 lines in the keybinding handler.
- **Shift+Enter** is currently a no-op for the structural resolver and falls through to contenteditable's default. Confirm that inserts a soft `\n` and plays well with `whiteSpace: pre-wrap` measurement.
- **Drag-and-drop block reordering** (already in the Phase 2 roadmap).
- **Block type change** via the `/` command palette (Phase 2+).
- **Focus/Zen mode** toggle (Phase 4 feature from the docs).

## Infrastructure

- **Persistence (SurrealDB Wasm + IndexedDB)** — the big Phase 2 item. Currently the document is in-memory; refresh = gone. This is the most valuable single piece of work from a user perspective.
- **ResizeObserver fallback** for browsers that don't ship it (very rare now). Current code already has `typeof ResizeObserver === 'undefined'` guard; might want a fallback to periodic remeasurement.
- **Scroll anchoring during active wheel scroll**. Current anchoring compensates scrollTop when measurements change. If measurement changes happen *during* fast wheel input, the anchor adjustment can fight with the user's scroll momentum. Add an "isScrolling" idle gate if this shows up.
- **Font loading** (`document.fonts.ready`): currently not waited on, because ResizeObserver made it moot for virtualization correctness. But pretext's initial estimate accuracy depends on the right font being loaded at measure time. Small win for scrollbar stability on first paint if we add the wait.

## Measurement & tooling

- **Real-Chrome re-measurement** on the user's own display (not Playwright headless-shell). Headless tends to understate if anything, but worth confirming the 60 FPS number holds for a real user.
- **Long-form perf test**: 100,000+ words (the Phase 1 target from the docs). Currently measuring 500 blocks × ~200 words ≈ 100K words already — but the synthetic doc could be scaled up to confirm the ceiling.
- **Memory leak check**: type for 10 minutes in the starter doc and watch heap. No leak expected, but confirm.

## Documentation

- **Update ADR-002** to note that pretext 0.0.5 is pure JS over `measureText`, not "Canvas/Wasm". The architectural conclusion is the same (no DOM reflow), but the mechanism detail is different.
- **Write an ADR-007** for the ResizeObserver + scroll-anchoring pattern. The library author explicitly calls this out as a target use case for pretext, and the combination is worth documenting as a first-class pattern for Phase 2+ work.
- **Add a short pretext API cheat sheet** to `docs/pretext-research.md` covering `prepareWithSegments`, `layoutWithLines`, `walkLineRanges`, and the `rich-inline` helper — material we'll want when Dual Pulse and character @mentions come online.

## Book page types (front matter + back matter)

Add standard publishing page types so a StoryForge document can look like a real book, not just a stack of chapters.

**Model:** extend `Chapter` with a `kind` field:
```ts
kind: 'standard' | 'cover' | 'title' | 'dedication' | 'epigraph' | 'toc' | 'acknowledgments' | 'afterword' | 'about-author'
```
Default is `standard` (existing behavior). Migration is trivial — missing field reads as `standard`.

**Sidebar UX:** the `+` button becomes a small dropdown:
- New chapter *(default)*
- Cover
- Dedication
- Epigraph
- Acknowledgments
- Afterword

Each template creates a chapter with a pre-filled starter block appropriate to the kind (e.g. a centered title placeholder for Cover, a short centered paragraph for Dedication).

**Rendering differences for non-standard kinds:**
- Centered layout (not left-aligned 680px column)
- Bigger typography for Cover + Title
- No per-block TEXT/DIALOGUE label (suppress the type tag — these pages aren't "text blocks" in the authorial sense)
- Ideally a subtle visual marker in the sidebar (icon or italic)

**Scope for the first pass:** Cover, Dedication, Epigraph, Acknowledgments, Afterword. Five authored kinds, no derived ones. TOC is deferred because it's *computed* from the chapter list (either a reactive view that can drift or a "generate once, manually edit" snapshot — separate design decision).

**Estimated effort:** half a session. Most of the work is the rendering variants in BlockView + Editor; the data model change is a one-line union extension and a IDB schema v5 that just adds the field with a default.

**Not to do in this slice:**
- TOC auto-generation (its own slice)
- Half-title page (rarely matters for digital-first novels)
- Title page separate from cover (merge for now)
- Copyright page (wait until export exists — it's really for the EPUB/PDF pipeline)
- Index, glossary, appendix (back matter for non-fiction; defer until StoryForge cares about non-fiction)

## Phase 3+ hooks

- **Sentence rhythm via `walkLineRanges`** for Story Pulse. Real per-line breakpoints from pretext instead of guessing from sentence lengths.
- **@chenglou/pretext/rich-inline** for character @mentions, code spans, chips in dialogue blocks.
