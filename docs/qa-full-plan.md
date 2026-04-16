# StoryForge — Full QA Test Plan

Manual test plan covering every user-facing feature. Run through
sequentially in a single browser session (~90 minutes). Mark each
item pass/fail. When a fail is found, note the browser + steps to
reproduce.

**Browsers to test:** Firefox (primary), Chrome, Safari (if available).
**Start state:** clear IndexedDB (`Application → Storage → IndexedDB → storyforge → Delete database`) and localStorage for a clean slate.

---

## 1. Boot + Document Management

### 1.1 First boot (no data)
- [ ] App shows the **Document Picker** (not the editor).
- [ ] "No documents yet" message visible.
- [ ] **+ New document** button works → creates "Untitled" → opens the editor.

### 1.2 Single-document fast path
- [ ] Reload the page → editor opens directly (no picker shown, since exactly 1 document exists).

### 1.3 Multi-document
- [ ] Sidebar → **Switch document** → returns to the picker.
- [ ] Picker shows the first document with title + "updated X ago".
- [ ] **+ New document** → creates a second document → opens it.
- [ ] Reload → picker shows both documents.
- [ ] Click the first document → it opens with its original content.
- [ ] Switch back to the second document → it opens with its content.

### 1.4 Document delete
- [ ] Hover a document row in the picker → **×** appears.
- [ ] Click × → confirm modal appears with danger styling.
- [ ] Cancel → nothing happens.
- [ ] Confirm → document removed from list, success toast.
- [ ] Reload → deleted document does not reappear.
- [ ] Open DevTools → IndexedDB → verify no orphaned blocks/chapters/sentiments for that document ID.

### 1.5 Document settings
- [ ] Right panel → **Document** button → modal opens.
- [ ] Edit title → change persists on reload.
- [ ] Edit author → shows in exports.
- [ ] Edit synopsis → shows in Markdown export as blockquote.
- [ ] Also accessible via `Alt+Shift+D` hotkey and command palette.

---

## 2. Chapters

### 2.1 Create
- [ ] Sidebar → **+** dropdown → **New chapter** → chapter appears in list, editor switches to it.
- [ ] Chapter auto-numbered ("Chapter 2", "Chapter 3", …).

### 2.2 Rename
- [ ] Double-click a chapter title in the sidebar → inline edit mode.
- [ ] Type a new name → blur or Enter → name saved.
- [ ] Try empty name → error toast "Chapter title cannot be empty".
- [ ] Reload → renamed chapter persists.

### 2.3 Delete
- [ ] Hover a chapter → **⋯** → **Delete chapter** → confirm modal shows block count.
- [ ] Cancel → nothing happens.
- [ ] Confirm → chapter removed, blocks go to graveyard, success toast.
- [ ] Cannot delete the last remaining chapter (item disabled in menu).

### 2.4 Switch
- [ ] Click another chapter in the sidebar → editor shows that chapter's blocks.
- [ ] Word count in right panel updates to the new chapter.

### 2.5 Book page types
- [ ] Sidebar → **+** → **Cover** → creates a cover chapter with centered layout.
- [ ] **Dedication** → italic text, centered, `padded-top: 20vh`.
- [ ] **Epigraph** → same italic centered treatment.
- [ ] **Acknowledgments** / **Afterword** → centered, no block chrome.
- [ ] Non-standard chapters show a glyph (◆/♡/"/✦/·) in the sidebar.
- [ ] Switch to a standard chapter → normal left-aligned layout resumes.

---

## 3. Blocks

### 3.1 Create
- [ ] Type to the end of a block → press **Enter** → new empty block below, same type.
- [ ] Press Enter mid-content → **soft newline** (no split, no new block).
- [ ] Hover any block → click **+** icon in header → new text block below.

### 3.2 Block types
- [ ] Click the **TEXT** / **DIALOGUE** / **SCENE** / **NOTE** label → type picker opens.
- [ ] Pick a different type → label updates, type-specific UI appears (scene editor / dialogue chip / nothing for note).
- [ ] Also changeable via **⋯** menu → Block type section.
- [ ] Hover the type label → tooltip explains what the type is for.

### 3.3 Delete
- [ ] Hover block → click **trash icon** → confirm modal → block goes to graveyard.
- [ ] Backspace on an **empty** block → block removed (no confirm needed).
- [ ] Backspace at the **start** of a non-empty block → nothing happens (no merge).

### 3.4 Duplicate
- [ ] **⋯** menu → **Duplicate** → identical block appears below, success toast.

### 3.5 Move (keyboard)
- [ ] Focus a block → **Alt+↑** → block moves up, violet flash animation.
- [ ] **Alt+↓** → block moves down.
- [ ] At the top → Alt+↑ is a no-op. At the bottom → Alt+↓ is a no-op.

### 3.6 Drag and drop
- [ ] Hover block → **drag handle** (⋮⋮ icon) visible in the header.
- [ ] Grab the handle → drag over another block → **violet line indicator** shows above or below.
- [ ] Drop → block moves to the indicated position.
- [ ] Drop onto a block in a different chapter → rejected (nothing happens).

### 3.7 Copy content
- [ ] **⋯** menu → **Copy content** → success toast. Paste in an external editor → plain text matches.

### 3.8 Context menu
- [ ] Click **⋯** on a block → menu opens with type picker, duplicate, move, copy, delete.
- [ ] Keyboard: ↑/↓ navigate, Enter selects, Esc closes.
- [ ] Click outside / scroll → menu dismisses.
- [ ] Only one menu open at a time (opening one closes another).

---

## 4. Inline Formatting

### 4.1 Bold
- [ ] Select text → **Cmd/Ctrl+B** → selected text becomes bold.
- [ ] Selection stays in place after toggle.
- [ ] Select the bold text → Cmd+B again → bold removed.
- [ ] Reload → bold persists.

### 4.2 Italic
- [ ] Same as bold but **Cmd/Ctrl+I**.

### 4.3 Both
- [ ] Select text → Cmd+B → Cmd+I → text is both bold and italic.
- [ ] Export as Markdown → shows `***text***` or `**_text_**`.

### 4.4 Export round-trip
- [ ] Bold text in Markdown export → `**text**`.
- [ ] Italic in Markdown → `*text*`.
- [ ] Bold text in DOCX → opens in Word/LibreOffice as bold.
- [ ] Bold text in EPUB → `<b>text</b>` in the XHTML.
- [ ] JSON export includes `marks` array on blocks that have formatting.

---

## 5. Dialogue

### 5.1 Speaker picker
- [ ] Change a block to **Dialogue** → inline speaker chip appears in the header.
- [ ] Click chip → context menu lists characters + "Unassigned".
- [ ] Pick a character → chip shows name + color dot, left border turns that color.

### 5.2 Chat bubble styling
- [ ] Dialogue blocks render with rounded corners, max-width ~78%, tinted background.
- [ ] Consecutive dialogue blocks have tighter spacing (chat-thread feel).
- [ ] Each speaker's bubble has their character color as the background tint.

### 5.3 Live auto-detect
- [ ] In an empty dialogue block (no speaker), type `Alice: Hello` (where Alice is a character).
- [ ] On typing the space after `:`, the `Alice: ` prefix strips, Alice becomes the speaker, bubble turns her color.

### 5.4 Enter inherits type
- [ ] Press Enter at the end of a dialogue block → new dialogue block (not text).

### 5.5 Tab cycles speakers
- [ ] Focus a dialogue block → press **Tab** → speaker advances to the next character.
- [ ] **Shift+Tab** → goes backward. Wraps at both ends.
- [ ] If a scene block above defines a cast → Tab only cycles through that cast.

### 5.6 POV character
- [ ] Sidebar → character **⋯** menu → **Make POV character** → ★ appears next to the name.
- [ ] POV character's dialogue bubbles **right-align** (iMessage style).
- [ ] Other characters stay left-aligned.
- [ ] Removing POV → bubbles return to left.
- [ ] Deleting the POV character → POV clears automatically.

### 5.7 Parenthetical
- [ ] Dialogue block header has a small italic **(aside)** input next to the speaker chip.
- [ ] Type `whispering` → shows in exports:
  - Fountain: `(whispering)` on its own line.
  - Markdown: `> *(whispering)*`.
  - DOCX: italic indented paragraph.
  - EPUB: `<p class="parenthetical">`.

### 5.8 Rename propagation
- [ ] Rename a character in the sidebar → every dialogue block by that character updates its displayed name instantly. No reload needed.

### 5.9 Delete propagation
- [ ] Delete a character → their dialogue blocks become "unassigned" but keep their content.

### 5.10 Scene cast filter
- [ ] Create a **Scene** block → pick 2 characters as the cast.
- [ ] Below the scene, create a dialogue block → open the speaker picker.
- [ ] Expected: the 2 cast characters listed first under "Speaker (scene cast)", others under "All characters".

### 5.11 Fountain CONT'D
- [ ] Two consecutive dialogue blocks by the same speaker → export as Fountain.
- [ ] Expected: second cue reads `ALICE (CONT'D)`.

---

## 6. Scene

### 6.1 Metadata editor
- [ ] Change a block to **Scene** → inline editor appears below the header.
- [ ] Fill in **Location**, **Time**, **Mood** → values persist on reload.
- [ ] **Cast** chips: click to toggle characters on/off for this scene.

### 6.2 Plot timeline
- [ ] Sidebar → **Plot timeline** → modal shows every scene block grouped by chapter.
- [ ] Each entry shows location, time, mood, content excerpt, character chips.
- [ ] Add a new scene block → close and reopen timeline → new scene appears.

---

## 7. Notes

- [ ] Change a block to **Note** → label turns grey (stone-400).
- [ ] Note content is **NOT** counted in word count.
- [ ] Note content is **NOT** included in any export (Markdown, JSON, Fountain, EPUB, DOCX, PDF).
- [ ] Note content is **NOT** analyzed for sentiment.

---

## 8. Exports

### 8.1 Text formats
- [ ] Sidebar → **Markdown** → `.md` file downloads. Open it → chapter headings, dialogue blockquotes, scene italics, character appendix.
- [ ] **JSON** → `.json` file downloads. Valid JSON with `format_version: 1`, chapters, blocks, characters, marks.
- [ ] **Fountain** → `.fountain` file downloads. Title page, INT. scene headings, uppercase speaker cues, parentheticals.

### 8.2 Binary formats
- [ ] **EPUB** → `.epub` file downloads. Open in Calibre/Thorium → chapters, styles, dialogue blockquotes. File > 500 bytes. First 4 bytes = `PK` (ZIP header).
- [ ] **DOCX** → `.docx` file downloads. Open in Word/LibreOffice → chapter page breaks, styled headings (visible in outline pane), dialogue indent, bold/italic preserved.
- [ ] **PDF** → `.pdf` file downloads. Open in any viewer → title page, chapter headings, readable text. (Note: inline bold/italic NOT rendered — known limitation.)

### 8.3 Export toasts
- [ ] Every successful export shows a success toast.
- [ ] Force a failure (e.g. disconnect network mid-download?) → error toast with message.

### 8.4 Filename
- [ ] Document title = "My Novel" → exported file = `my-novel.md` / `my-novel.epub` / etc.
- [ ] Special characters in title are stripped from filename.

---

## 9. Dead Text Graveyard

### 9.1 Open
- [ ] Sidebar → **Dead text graveyard †** → modal opens.
- [ ] Also accessible via `Alt+Shift+G` hotkey.

### 9.2 Content recovery
- [ ] Delete a block with content → open graveyard → the block appears with its content (not empty).
- [ ] Content is recovered from the revision history if the block was emptied before deletion.

### 9.3 Restore
- [ ] Hover a graveyard entry → **Restore ↩** appears.
- [ ] Click → block reappears at the end of the current chapter, success toast.
- [ ] Graveyard list refreshes (entry disappears).

### 9.4 Origin tracking
- [ ] The graveyard entry shows which chapter the block came from + deletion timestamp.

---

## 10. Revision History

### 10.1 Open
- [ ] Block header → **clock icon** (⟲) → popover opens listing revisions.

### 10.2 Revisions accumulate
- [ ] Type in a block → wait 1s → type more → wait → click ⟲.
- [ ] Expected: 2+ entries with different timestamps.

### 10.3 Dedup
- [ ] Don't change anything → click ⟲ → no new entry appears (identical content not duplicated).

### 10.4 Restore
- [ ] Click an older entry → block content reverts, success toast.
- [ ] Caret lands at the end of the restored content.

### 10.5 Current marker
- [ ] The entry matching the current content shows "· current" in violet, not clickable.

### 10.6 Char delta
- [ ] Entries show `+N` / `-N` character count changes (green/red).

### 10.7 Cap
- [ ] After 20+ edits to the same block, the oldest entries are trimmed (max 20 per block).

### 10.8 Dismiss
- [ ] Click outside the popover → closes.
- [ ] Scroll the editor → popover closes.
- [ ] Press Esc → popover closes.

---

## 11. Undo / Redo

### 11.1 Content undo
- [ ] Type "hello" in a block → **Ctrl+Z** → text reverts to before "hello".
- [ ] **Ctrl+Shift+Z** → "hello" re-appears.

### 11.2 Batch behavior
- [ ] Type continuously for 3 seconds → Ctrl+Z → the entire burst undoes in one step (not per-keystroke).

### 11.3 Block delete undo
- [ ] Delete a block (trash icon + confirm) → **Ctrl+Z** → block reappears at its original position.

### 11.4 Type change undo
- [ ] Change a block from Text to Dialogue → **Ctrl+Z** → reverts to Text with original metadata.

### 11.5 Redo after new edit
- [ ] Type "A" → Ctrl+Z → type "B" → Ctrl+Shift+Z → nothing happens (redo tail was cleared by the new edit).

### 11.6 Browser undo is intercepted
- [ ] Focus a contenteditable → Ctrl+Z → our undo fires, NOT the browser's built-in (which would only undo the last keystroke within the contenteditable).

---

## 12. Focus + Zen Mode

### 12.1 Focus mode
- [ ] Sidebar → **Focus mode** (or `Alt+Shift+F`) → sidebar and right panel slide out.
- [ ] Editor centers with max-width 860px.
- [ ] Non-focused blocks dim to 30% opacity. Hover/focus-within brightens them.
- [ ] "Exit focus" + "Zen" buttons appear in the top-right.
- [ ] Click "Exit focus" → panels return with animation.

### 12.2 Zen mode
- [ ] In focus mode → click **Zen** (or `Alt+Shift+Z`) → block chrome (type labels, header buttons, sentiment badges, ECG) all disappear.
- [ ] Contenteditable borders become transparent.
- [ ] Scroll padding grows to 15vh.
- [ ] Click "Exit zen" → chrome returns (still in focus mode). Click "Exit focus" → panels return.

---

## 13. Spellcheck

- [ ] Right panel → **Spellcheck** → toggle between on/off.
- [ ] When off → no red squiggles on misspelled words.
- [ ] When on → red squiggles return.
- [ ] Reload → setting persists (stored in `localStorage['storyforge.spellcheck']`).

---

## 14. Hotkeys

### 14.1 Defaults work
- [ ] `Ctrl/Cmd+K` → command palette opens.
- [ ] `F1` → hotkey settings modal opens.
- [ ] `Alt+Shift+F` → focus mode toggles.
- [ ] `Alt+Shift+Z` → zen mode toggles.
- [ ] `Alt+Shift+G` → graveyard opens.
- [ ] `Alt+Shift+L` → plot timeline opens.
- [ ] `Alt+Shift+N` → new chapter created.
- [ ] `Alt+Shift+K` → spellcheck toggles.
- [ ] `Alt+Shift+D` → document settings opens.
- [ ] `Ctrl+Z` → undo.
- [ ] `Ctrl+Shift+Z` → redo.

### 14.2 Rebinding
- [ ] F1 → click a combo pill → "press key…" shows (pulsing violet).
- [ ] Press a new combo → pill updates.
- [ ] Reload → binding persists.
- [ ] Clash: rebind one action to another's combo → toast "Swapped with X", both update.

### 14.3 Reset
- [ ] F1 → **Reset defaults** → all combos return to the original values, success toast.

### 14.4 Close-while-capturing
- [ ] Click a combo pill (capture mode) → close the modal (× or backdrop) → reopen → pill shows the normal combo (not "press key…").

---

## 15. Command Palette

- [ ] `Ctrl/Cmd+K` → palette opens at 18vh from top.
- [ ] Type "focus" → "Focus mode" row appears → Enter → focus toggles.
- [ ] Type "epub" → "Export as EPUB" appears → Enter → EPUB downloads.
- [ ] Type "undo" → "Undo" appears → Enter → undo fires.
- [ ] Arrow keys navigate, Enter executes, Esc closes.
- [ ] Click outside → closes.
- [ ] Fuzzy matching: "mkd" matches "Export as Markdown".

---

## 16. Characters

### 16.1 Create
- [ ] Sidebar → type in "Add character" input → Enter → character appears with a color dot.
- [ ] Empty name → error toast.

### 16.2 Rename
- [ ] Double-click a character → inline edit. Blur/Enter to confirm.
- [ ] Empty name → error toast.

### 16.3 Delete
- [ ] Character **⋯** → **Delete character** → confirm modal → character removed, info toast.
- [ ] Dialogue blocks by that character become unassigned.

### 16.4 POV
- [ ] Character **⋯** → **Make POV character** → ★ appears.
- [ ] **⋯** → **Remove POV mark** → ★ disappears.

### 16.5 Auto-detection
- [ ] Type a character's name in a text block → their color dot appears in the block header's character mention area.

---

## 17. Story Pulse + Sentiment

### 17.1 ECG
- [ ] Story Pulse ECG bar chart renders above the editor.
- [ ] Each block in the active chapter gets a colored bar (green = positive, red = negative, grey = neutral).
- [ ] Bars update reactively as sentiment analysis completes.

### 17.2 Chapter mood
- [ ] Right panel → **Chapter mood** → shows dominant sentiment label with percentage.

### 17.3 Document mood heatmap
- [ ] Right panel → **Document mood** → proportional chapter bars.

### 17.4 Character sentiment
- [ ] Right panel → **Character mood** → per-speaker dominant sentiment for dialogue blocks.
- [ ] Only appears when dialogue blocks exist with speakers and sentiment.

### 17.5 Sonification
- [ ] Right panel → **Play ambient tone** → sound plays.
- [ ] **Stop** → sound stops.
- [ ] Tone changes reactively with chapter mood (if mood changes while playing).

---

## 18. Word Count + Pulse

### 18.1 Word count
- [ ] Right panel → **Word count** → document total + chapter total.
- [ ] Reading time estimate (`~X min read`).
- [ ] Dialogue vs narration bar chart (teal fill for dialogue).

### 18.2 Writer pulse
- [ ] Right panel → **Writer pulse** → WPM, burst/s, keys, session duration.
- [ ] Type in the editor → numbers update (polling every 1.5s).
- [ ] **Reset** → counters clear.

---

## 19. Block Types Help

- [ ] Sidebar → **Block types help ?** → modal opens.
- [ ] Four cards: Text, Dialogue, Scene, Note — each with tagline, "Use it for", "How it behaves".
- [ ] Information matches actual behavior (cross-check against what you've tested above).

---

## 20. Toast System

### 20.1 Active toasts
- [ ] Trigger any action that toasts (export, delete, etc.) → toast appears bottom-right.
- [ ] Auto-dismisses after ~3s (info/success) or ~5s (error).
- [ ] Click × to dismiss early.

### 20.2 Toast history
- [ ] After all active toasts dismiss → a small clock button appears bottom-right.
- [ ] Click it → popover lists recent toasts with relative timestamps.
- [ ] **Clear** button wipes history.

---

## 21. Save Indicator

- [ ] Type in a block → "Saving…" appears briefly in the editor footer.
- [ ] After writes settle → "Saved" appears.
- [ ] After 2s → indicator fades away.

---

## 22. Backup Reminder

- [ ] Clear `localStorage['storyforge.lastExportAt']` → reload → after ~5s, a toast says "Tip: export your work regularly."
- [ ] Export any format → `storyforge.lastExportAt` updates.
- [ ] Manually set the timestamp to 8 days ago → reload → toast says "You haven't exported in 8 days."

---

## 23. Crash Boundary

- [ ] In DevTools console: `document.querySelector('[data-editable]').__proto__.dispatchEvent = null; document.querySelector('[data-editable]').click()` (or any way to trigger an error in the render tree).
- [ ] Expected: recovery screen with error message + "Reload" button + "Download emergency backup" button.
- [ ] Click **Download emergency backup** → JSON file downloads with the document's data.
- [ ] Click **Reload** → app restarts normally.

---

## 24. PWA

- [ ] Run `npm run build && npm run preview`.
- [ ] Open the preview URL → check for install prompt (browser-dependent).
- [ ] DevTools → Application → Service Workers → one active worker.
- [ ] Toggle offline in DevTools → reload → app still loads from cache.
- [ ] The heavy chunks (docx, jspdf, jszip) are NOT precached (check precache list).

---

## 25. Performance

- [ ] Navigate to `/perf` → 100k-word synthetic document loads.
- [ ] Scroll smoothly top to bottom → FPS overlay stays green (60 FPS).
- [ ] DevTools → Performance → record 5s of scrolling → no long frames > 16ms.
- [ ] Memory tab → take snapshot → type for 5 minutes → take another → delta is bounded (no unbounded growth).

---

## 26. Dark Mode

- [ ] Right panel → **Theme** → toggle between light and dark.
- [ ] Every surface respects the theme: editor, sidebar, right panel, modals, context menus, toasts, dialogue bubbles, graveyard, timeline, hotkey modal, command palette, document picker, crash boundary.
- [ ] Reload → theme persists.

---

## 27. Smart Paste

- [ ] Copy a multi-paragraph text from an external source (e.g. a Wikipedia article with blank lines between paragraphs).
- [ ] Paste into a block → each paragraph becomes its own block.
- [ ] Single-paragraph paste → inserts inline without splitting.

---

## 28. Drag-and-Drop Edge Cases

- [ ] Drag a block → scroll the editor while dragging → auto-scroll should work (browser-native).
- [ ] Drop on the contenteditable area of a target block (not just the header) → still reorders (not text-insert).
- [ ] Drag across chapter boundaries → rejected.
- [ ] Drag + drop the same block onto itself → no-op.

---

## Sign-off

| Area | Pass / Fail | Notes |
|---|---|---|
| Boot + Documents | | |
| Chapters | | |
| Blocks | | |
| Inline Formatting | | |
| Dialogue | | |
| Scene | | |
| Notes | | |
| Exports | | |
| Graveyard | | |
| Revision History | | |
| Undo / Redo | | |
| Focus + Zen | | |
| Spellcheck | | |
| Hotkeys | | |
| Command Palette | | |
| Characters | | |
| Story Pulse | | |
| Word Count + Pulse | | |
| Block Types Help | | |
| Toasts | | |
| Save Indicator | | |
| Backup Reminder | | |
| Crash Boundary | | |
| PWA | | |
| Performance | | |
| Dark Mode | | |
| Smart Paste | | |
| DnD Edge Cases | | |

**Tested by:** _______________
**Date:** _______________
**Browser:** _______________
**Build:** `git rev-parse --short HEAD` → _______________
