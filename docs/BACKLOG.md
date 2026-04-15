# StoryForge Backlog

Informal list of ideas captured during development. Not a roadmap — the real roadmap lives in `05-ROADMAP-AND-ADR.md`. Items here are "worth considering when we get there," not commitments.

Last cleaned: 2026-04-15 (second pass — Tier 1 UX arc done).

## AI (deferred Phase 3+)

The biggest remaining category. All five items share: they need an AI pipeline beyond the current sentiment model, and some need prompt-engineering work in addition to code.

- **Inconsistency detection.** Compare character descriptions across mentions; flag contradictions ("Alice has blue eyes" vs "her green eyes met his"). Needs a second AI pipeline per character and a UI surface to show the flag. Backlog since Phase 3.
- **Rich moods via zero-shot classification.** Swap the current 3-way sentiment for zero-shot with custom mood labels (melancholic, tense, triumphant, etc.). Bigger model, richer output. Would feed the Story Pulse ECG and mood heatmap with more meaningful colors.
- **Ghost reader** (Phase 4). AI reads the draft back as a critical first reader — flags confusion, pacing issues. Needs prompt design and UI surface. Multi-session.
- **Character simulator** ("What if…"). Ask a character how they'd react to a scenario, grounded in their character card. Roleplay prompt grounded in character metadata. Multi-session.
- **Full sonification engine.** Real-time ambient generation that evolves with the text, beyond the baseline sentiment→chord mapping we shipped. Needs a design pass before code — what maps to what, how the audio layer stays responsive while typing.

## Rich text / inline formatting

- **Minimal inline formatting (bold / italic)**. Cmd+B / Cmd+I stored as marks on the `Block` type. No ProseMirror — keeps the "we own every pixel" feeling. ~1–2 days including cursor-safety around mark boundaries. Probably the single highest-value non-AI item remaining.
- **Full rich text (ProseMirror / Lexical)**. Rewrite `BlockView`. Gains: tables, links, inline code, undo history, real selection tracking. Costs: ~200 KB bundle, multi-week rewrite, loses the custom feel. **Not recommended** unless a specific use case demands it.

## Export pipeline polish

- **Cover image for EPUB.** Currently no cover. Needs an image input (paste / upload / URL) and an OPF manifest entry. Could also drive a cover block type for the in-app cover page.
- **PDF typography.** jsPDF output is functional but ugly. Options: swap to pdf-lib with custom font embedding, or rely on browser print-to-PDF with a dedicated print stylesheet. Also: PDF currently uses screenplay-style speaker layout (uppercase cue on own line) which is wrong for a novel — needs a separate novel-style rendering path.
- **DOCX styles.** Current DOCX has inline paragraph settings. A proper `styles.xml` with Heading 1/2, Body, Dialogue would play better with Word's outline view.
- **EPUB validator pass.** Run `epubcheck` against generated files. Probably a few warnings.
- **Fountain CONT'D for PDF?** Only Fountain has it today. Decide whether the PDF's screenplay-style dialogue should honor the same convention.

## UI polish

- **Shift+Enter** verification. Still falls through to contenteditable default. Confirm it inserts a soft `\n` and plays well with `whiteSpace: pre-wrap` measurement. Low priority.
- **Toast history / action log.** Recent toasts are ephemeral. A small "recent activity" popover could let the user see what they did last 5 minutes ago.
- **RightPanel further polish.** Current stack is already busy (settings, chapter mood, doc mood heatmap, pulse dashboard, word count, sonification, document metadata). Candidates if we want more: block type filter, session notes, reading-time estimate.
- **Smooth wheel scrolling (rAF accumulator).** Wheel input is per-tick; a rAF-driven delta accumulator animating `scrollTop` over ~150ms would feel smoother on Firefox. Note: `scroll-behavior: smooth` is NOT a fix — it only smooths programmatic scrolls and actively fights the virtualizer's anchor restore (learned this the hard way). Low priority until someone complains.
- **Dialogue-only word counts.** Extend the pulse dashboard to break out dialogue words separate from narration. Useful for scripts.
- **Per-character sentiment arcs.** Extend Story Pulse to show a mood line per speaker over time. Lets you see one character darken while another stays steady.

## Infrastructure

- **ResizeObserver fallback.** Current code guards with `typeof ResizeObserver === 'undefined'` but has no fallback path. Very rare to matter now, but worth a periodic remeasurement fallback for bulletproofing.
- **Scroll anchoring during active wheel scroll.** If measurement changes happen *during* fast wheel input, the anchor adjustment can fight momentum. Add an "isScrolling" idle gate if this shows up.

## Measurement & QA

- **Real-Chrome re-measurement** on the user's own display (not Playwright headless-shell). Confirm the 60 FPS number holds.
- **Memory leak check.** Type for 10 minutes in the starter doc, watch heap.
- **Chunk-split sanity check.** Rerun `vite build --mode analyze` to confirm the heavy export libs are still isolated in dynamic chunks.

## Documentation

- **Update ADR-002** to note pretext 0.0.5 is pure JS over `measureText`, not "Canvas/Wasm". Mentioned in the updated roadmap but the ADR itself still says the old thing.
- **Write ADR-007** for the ResizeObserver + scroll-anchoring pattern. The library author calls this out as pretext's target use case.
- **Write ADR-008** for the chunk-split export pipeline: why each heavy lib (jszip / docx / jspdf) is dynamically imported and where the split boundaries live.
- **Pretext API cheat sheet** in `docs/pretext-research.md` covering `prepareWithSegments`, `layoutWithLines`, `walkLineRanges`, and the `rich-inline` helper.

## Phase 3+ hooks

These are the "future feature anchors" — plumbing that unlocks a feature later rather than standalone work.

- **Sentence rhythm via `walkLineRanges`** for Story Pulse. Real per-line breakpoints from pretext instead of guessing from sentence lengths.
- **`@chenglou/pretext/rich-inline`** for character @mentions, code spans, chips in dialogue blocks. Ties into the inline formatting item above.

## Done (recent, 2026-04-14 → 2026-04-15)

Cleared from this backlog in the second pass. Kept as a historical breadcrumb — delete when the list grows unwieldy.

Phase 2 / editor foundations:
- Persistence (plain IDB after the SurrealDB pivot)
- Drag-and-drop block reordering
- Focus / Zen mode + animations
- Smart paste (split on `\n\n`)
- Enter splits at end of block (mid-block is soft newline)
- Spellcheck toggle
- Font loading wait
- Book page types (Cover / Dedication / Epigraph / Acknowledgments / Afterword)
- 100k-word perf test via `/perf` route
- Word count in RightPanel
- Chapter delete with cascade to graveyard
- Per-block revision history (IDB v5 + ⟲ popover + 20-cap)
- Graveyard content recovery from revision history

Dialogue rework (the full arc):
- Speaker picker (inline chip in block header)
- Live leading-`Name:` auto-detect
- Chat-bubble styling with per-character color tint
- Scene cast filter for the picker
- POV character + right-align bubbles (iMessage feel)
- Tab / Shift+Tab cycles speakers in the pool
- Rename propagation (via denorm drop — speaker_name removed, derived from speaker_id)
- Delete propagation (orphaned dialogue → unassigned)
- Parentheticals (`(whispering)` aside) rendered in every exporter
- Fountain CONT'D markers for consecutive same-speaker lines

Tier 1 UX arc:
- Block left-click context menu (block + chapter + character variants)
- Shared ContextMenuHost with keyboard nav + outside-click dismiss
- Custom confirm modal + toast system (replaced browser `confirm()`)
- Hotkey settings (F1) with click-to-rebind, clash swap, reset defaults
- Command palette (Ctrl/Cmd+K) with fuzzy search across actions + exporters
- Block move flash animation (Alt+↑↓ violet glow)
- Document settings modal (title / author / synopsis)
- solid-icons swap (replaced scattered emoji with Tabler outline set)
- Backspace-at-start-of-block merge bug fixed
- Enter mid-content no longer splits
- Caret after revision restore lands at end
- Inline `+ new block` button in header
- Sidebar/right panel no longer stretch the page (grid row bounded)

Roadmap doc:
- `05-ROADMAP-AND-ADR.md` synced with actual Phase 1-4 state.
