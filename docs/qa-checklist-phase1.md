# Phase 1 Manual QA Checklist

Run against `npm run dev` → `http://localhost:5173/` (for editing feel) and `http://localhost:5173/perf` (for scrolling feel). Every box must be checked before declaring Phase 1 done. Any failure either gets fixed in Plan 2 or is explicitly documented as deferred to Phase 2.

## Writing feel (the "5-minute paragraph" test)

- [ ] Open `/`. Cursor blinks in the starter block.
- [ ] Type a full paragraph (at least 3 sentences). No cursor jumps, no dropped characters, no lag.
- [ ] Sustain typing for 5 minutes continuously. Cursor stays where you expect. No character duplication. No silent data loss.

## Block structure keys

- [ ] `Enter` at the end of a block creates a new empty block below and moves the cursor into it.
- [ ] `Shift+Enter` inserts a soft line break inside the current block (does NOT create a new block).
- [ ] `Backspace` at offset 0 of a non-empty block merges it into the previous block. The cursor lands at the join point (end of the old previous content).
- [ ] `Backspace` on an empty block deletes the block and moves the cursor to the end of the previous block.
- [ ] `Backspace` at offset 0 of the very first block is a no-op (no crash).
- [ ] `ArrowUp` on the first line of a block moves focus to the previous block (cursor at end).
- [ ] `ArrowDown` on the last line of a block moves focus to the next block (cursor at start).
- [ ] `ArrowUp` / `ArrowDown` within a multi-line block navigates within the block, not between blocks.

## IME / international typing

- [ ] Type Hungarian text with diacritics: `árvíztűrő tükörfúrógép`. Every character appears correctly.
- [ ] During IME composition (e.g. dead-key accents or a system IME), `Enter` and `Backspace` do NOT break the composition.
- [ ] After composition ends, the committed text is stored correctly (switch focus and come back; content persists).
- [ ] Optional: test Japanese 日本語 or similar non-Latin IME if available. No crashes; composed text commits correctly.

## Paste

- [ ] Copy plain text from another app, paste into a block: text appears plain, no HTML leakage.
- [ ] Copy rich text (bold, links) from a web page, paste: appears as plain text, formatting stripped.
- [ ] Copy multi-paragraph text with newlines: appears as one block with embedded newlines (Phase 2+ may decide to split on paragraph boundaries).

## Long-line wrapping

- [ ] Type a very long unbroken string (e.g. `xxxxxxxxxxxxxxxxxxx...`). It wraps at the container edge rather than overflowing horizontally.
- [ ] Regression check for commit `85a03ca`.

## Virtualization under editing

- [ ] Open `/perf`. Scroll 500 blocks top to bottom. Smooth, no visible jump/snap. (Regression check for commit `b657ce6`.)
- [ ] Scroll velocity feels acceptable for your browser — note any jank here as a polish item.
- [ ] Click into a block near the middle, type a word. No cursor jumps. Your edit is preserved.
- [ ] Type slowly over 30 seconds in one block. No lag, no lost characters.
- [ ] Scroll away from the block you were editing, then scroll back. Your edits are still there (committed on blur).

## Visual / dark mode

- [ ] Toggle `dark` class on `<html>` in DevTools. Every island, border, and text color has a dark variant.
- [ ] Floating islands are visibly separated from the background on both themes.
- [ ] Block type labels (TEXT / DIALOGUE / SCENE / NOTE) are readable on both themes.

## Pass / fail

Phase 1 QA passes when every box above is checked. Record the outcome in `docs/perf-phase1-final.md` under "Manual QA outcome". Any failing item gets a line item there too, with either a fix commit reference or an explicit "deferred to Phase 2, see issue X" note.
