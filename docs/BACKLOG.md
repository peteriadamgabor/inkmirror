# StoryForge Backlog

Informal list of ideas captured during development. Not a roadmap — the real roadmap lives in `05-ROADMAP-AND-ADR.md`. Items here are "worth considering when we get there," not commitments.

Last cleaned: 2026-04-15. Items marked ✅ below are done and kept only as historical notes; delete when the list gets too long.

## Dialogue rework (the big one)

The current `dialogue` block type is half-implemented. You can change a block's type to `dialogue` via the header dropdown, and exporters (Markdown, DOCX, Fountain, EPUB) already render a `speaker_name` when present — but **there is no UI for setting the speaker**. The metadata field exists, nothing writes to it, and the editor gives no visual hint that dialogue blocks are different from text blocks.

This makes dialogue a dead feature in practice. Rework it into a first-class block that works the way a writer would expect.

**Core UX:**
- **Speaker picker** on every dialogue block, styled like the scene editor's cast-chip picker but single-select. Clicking opens a popover listing `store.characters`; picking one writes `{speaker_id, speaker_name}` into `block.metadata.data`.
- **Inline display** when collapsed: speaker name rendered small-caps or colored with the character's color, left of (or above) the content area. Feels like a script but stays inside the block-based model.
- **Unassigned state**: if no speaker is set, show a subtle `(unassigned)` affordance that opens the picker.
- **Color accent**: apply the character's color as a left border or speaker badge background so multi-speaker scenes are visually scannable. Matches the existing `CHARACTER_COLORS` palette.

**Smart auto-assign:**
- On content change, detect a leading `Name:` pattern (e.g. `Alice: Hello there.`) against `store.characters` (including aliases) and auto-set the speaker + strip the prefix from `content`. Reuse `character-matcher.ts` matching logic.
- If no match, leave content alone — don't guess.

**Keybindings:**
- `Cmd/Ctrl+Shift+D` on a text block converts to dialogue and opens the speaker picker.
- Inside a dialogue block, `Tab` could cycle through characters (debatable — maybe too magic).

**Data model:**
- Current: `DialogueMetadata { speaker_id: UUID; speaker_name: string }`. Keep it.
- When a character is renamed, dialogue blocks should pick up the new name automatically — currently `speaker_name` is a denormalized copy. Either add a store pass on `updateCharacter` that rewrites matching blocks, or drop `speaker_name` from persistence and derive it from `speaker_id` at render/export time. The latter is cleaner.
- When a character is deleted, dialogue blocks that referenced it should flip to "unassigned" (null speaker) but keep their content.

**Export tweaks:**
- Fountain already uppercases the speaker — good.
- DOCX/EPUB/Markdown render `**Speaker**` / small-caps — good.
- Dialogue without a speaker currently falls through to plain blockquote; keep that.
- Consider: "continued" marker (CONT'D) in Fountain when the same speaker has two consecutive dialogue blocks.

**Multi-speaker scenes:**
- Scene metadata already has `character_ids[]`. Consider filtering the speaker picker to the scene's cast when the dialogue block is inside a scene chapter. Quick win, low cost.

**Story Pulse integration:**
- Sentiment analysis already runs on dialogue content. Consider weighting dialogue sentiment by speaker (per-character mood arc) — natural evolution of the character cards feature.

**Not in this slice:**
- Voice style presets (tone, accent, register) — future character-card expansion
- Parentheticals (`(whispering)` in Fountain) — Fountain already supports but we don't model them
- Dialogue-only word counts — could live in the pulse dashboard later

**Estimated effort:** 1–2 sessions. Speaker picker UI + auto-detect + rename propagation is the core; the rest is polish.

## UI polish

- **RightPanel further polish.** Current stack: settings, chapter mood, document mood heatmap, pulse dashboard, word count, sonification. Still room for: block type filter, session notes, reading-time estimate.
- **Smooth wheel scrolling (rAF accumulator).** `scroll-smooth` ships only programmatic smoothing; wheel input is still per-tick. A rAF-driven delta accumulator animating `scrollTop` over ~150ms would feel better on Firefox. Low priority — not a real complaint yet.
- **Command palette** (`/` or `Cmd+K`). Block type change, chapter jump, character insert, toggle focus/zen. Currently everything is buried in the sidebar or header dropdown.
- **Toast history / action log.** Recent toasts are ephemeral. A small "recent activity" popover could let the user see what they did last 5 minutes ago.

## Paste & rich text

- ✅ ~~Smart paste: split on `\n\n`~~ — shipped 2026-04-15.
- **Minimal inline formatting (bold / italic)**. Bold and italic only, stored as marks on the `Block` type, `Cmd+B` / `Cmd+I` keybindings. No ProseMirror. ~1–2 days of work including cursor-safety around mark boundaries. Still the most tempting next step.
- **Full rich text (ProseMirror / Lexical)**. Rewrite `BlockView`. Gains: tables, links, inline code, undo history, real selection tracking. Costs: ~200 KB bundle, multi-week rewrite, loses the "we own every pixel" feeling. **Not recommended** unless a specific use case demands it.

## Editor experience

- ✅ ~~Enter in the middle of a block should split~~ — shipped 2026-04-15.
- ✅ ~~Drag-and-drop block reordering~~ — shipped in Phase 2.
- ✅ ~~Focus / Zen mode~~ — shipped in Phase 4 slice.
- ✅ ~~Spellcheck toggle~~ — shipped 2026-04-15.
- **Shift+Enter**: still falls through to contenteditable default. Confirm that inserts a soft `\n` and plays well with `whiteSpace: pre-wrap` measurement. Low priority.
- **Block move animations**. Alt+↑/↓ currently jumps the block instantly. A 120ms transform transition would feel less jarring. Small CSS change.
- **Caret after-restore placement**. Restoring a block revision from the `⟲` popover dumps the content back but doesn't place the caret anywhere predictable. Probably should land at the end.

## Infrastructure

- **ResizeObserver fallback** for browsers that don't ship it (very rare now). Current code already has `typeof ResizeObserver === 'undefined'` guard; might want a periodic remeasurement fallback.
- **Scroll anchoring during active wheel scroll**. Current anchoring compensates scrollTop when measurements change. If measurement changes happen *during* fast wheel input, the anchor adjustment can fight with the user's scroll momentum. Add an "isScrolling" idle gate if this shows up.
- ✅ ~~Font loading wait~~ — shipped 2026-04-15 (bounded 1.5s).
- **Per-document settings UI**. The `Document.settings` field exists (font family, line height, editor width, theme) but is never surfaced. Either expose a settings panel or quietly drop the field.

## Measurement & tooling

- **Real-Chrome re-measurement** on the user's own display (not Playwright headless-shell). Worth confirming the 60 FPS number holds for a real user.
- **Memory leak check**: type for 10 minutes in the starter doc and watch heap. No leak expected, but confirm.
- **Chunk-split sanity check**. After the exporter dynamic imports landed, rerun `vite build --mode analyze` to confirm nothing leaked the heavy libs into the main bundle.

## Documentation

- **Update ADR-002** to note that pretext 0.0.5 is pure JS over `measureText`, not "Canvas/Wasm". The architectural conclusion is the same (no DOM reflow), but the mechanism detail is different.
- **Write an ADR-007** for the ResizeObserver + scroll-anchoring pattern. The library author explicitly calls this out as a target use case for pretext.
- **Write an ADR-008** for the chunk-split export pipeline: why each heavy lib (jszip/docx/jspdf) is dynamically imported and where the split boundaries live.
- **Add a short pretext API cheat sheet** to `docs/pretext-research.md` covering `prepareWithSegments`, `layoutWithLines`, `walkLineRanges`, and the `rich-inline` helper.
- **Update 05-ROADMAP-AND-ADR.md** with the actual Phase 1–4 completion state. Phase 3 and Phase 4 checkboxes are still unticked even though most items shipped.

## AI (deferred Phase 3+ items)

- **Inconsistency detection**. Compare character descriptions across mentions; flag contradictions ("Alice has blue eyes" vs "her green eyes met his"). Needs a second AI pipeline and prompt design.
- **Rich moods via zero-shot classification**. Swap the current 3-way sentiment for zero-shot with custom mood labels (melancholic, tense, triumphant, etc.). Bigger model, richer output.
- **Ghost reader** (Phase 4). AI as a critical first reader — flags confusion, pacing issues.
- **Character simulator** ("What if…"). Ask a character how they'd react to a scenario, grounded in their character card.
- **Full sonification engine**. Real-time ambient generation that evolves with the text, beyond the baseline sentiment→chord mapping we shipped.

## Export pipeline polish

- **Cover image for EPUB**. Currently the EPUB has no cover. Needs an image input (paste / upload / URL) and an OPF manifest entry. Could also drive a cover block type for the in-app cover page.
- **PDF typography**. jsPDF output is functional but ugly. Options: swap to pdf-lib with custom font embedding, or rely on browser print-to-PDF with a dedicated print stylesheet.
- **DOCX styles**. Current DOCX has inline paragraph settings. A proper `styles.xml` with Heading 1/2, Body, Dialogue would play better with Word's outline view.
- **EPUB validator pass**. Run `epubcheck` against generated files — likely a few warnings.

## Phase 3+ hooks

- **Sentence rhythm via `walkLineRanges`** for Story Pulse. Real per-line breakpoints from pretext instead of guessing from sentence lengths.
- **@chenglou/pretext/rich-inline** for character @mentions, code spans, chips in dialogue blocks. Ties directly into the dialogue rework above.

## Done (recent)

For reference, items cleared from this backlog in the last cleaning pass:
- ✅ Persistence (Phase 2 shipped via plain IDB after SurrealDB pivot)
- ✅ Drag-and-drop block reordering
- ✅ Focus / Zen mode
- ✅ Smart paste (split on `\n\n`)
- ✅ Enter splits at caret
- ✅ Spellcheck toggle
- ✅ Font loading wait
- ✅ Book page types (Cover / Dedication / Epigraph / Acknowledgments / Afterword)
- ✅ 100k-word perf test (covered by `/perf` route)
- ✅ Word count in RightPanel
- ✅ Chapter delete with cascade graveyard
- ✅ Custom confirm modal + toast system
