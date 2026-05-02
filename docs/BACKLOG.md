# InkMirror Backlog

Informal list of ideas captured during development. Not a roadmap — the real roadmap lives in `05-ROADMAP-AND-ADR.md`. Items here are "worth considering when we get there," not commitments.

Last cleaned: 2026-05-01 (thirteenth pass — closed the three minor revision-history follow-ups from v0.6.0 in a single v0.6.2 ship: dropped the orphaned `restoreBlockContent` re-export, ticked the popover's `now` capture so relative timestamps don't freeze, and added the ⟲ button to the command palette via a focused-block capture on palette open).

## In flight

- [ ] HU native polish for v0.7.0 public-pages literary recraft
  - Owner: Peteri Adam (native HU)
  - Files: `src/i18n/hu.ts` — `landing.*` block (hero, features, philosophy, privacy, more, cta, footer)
  - Context: shipped as a faithful translation in v0.7.0; same workflow as `src/backup/demo-prose-hu.ts` polish.

## AI (deferred Phase 4+)

AI items still ahead. All share: they need an AI pipeline beyond what's currently in the worker, and some need prompt-engineering work in addition to code.

- **Ghost reader** (Phase 4). AI reads the draft back as a critical first reader — flags confusion, pacing issues. Needs prompt design and UI surface. Multi-session.
- **Full sonification engine.** Real-time ambient generation that evolves with the text, beyond the baseline sentiment→chord mapping we shipped. Needs a design pass before code — what maps to what, how the audio layer stays responsive while typing.
- **BYO local LLM (Ollama endpoint).** Roadmapped "maybe." Opt-in endpoint for users who want their own model doing analysis; still no cloud dependency. Separate settings surface. Subsumed by the Ultra tier entry below for the Tauri path; keep this as the escape hatch for tech-savvy web users who self-configure `OLLAMA_ORIGINS`.

## AI — tier expansion beyond current Lightweight / Deep

Current tiers: Lightweight (`DistilBERT multilingual sentiment`, ~135 MB) and Deep (`mDeBERTa-v3-base XNLI`, ~280 MB). One realistic next-tier candidate; the bigger LLM-shaped tiers (Max / Ultra / anti-generation guardrails) were considered on 2026-04-18 and dropped from the backlog as too far out of scope — re-capture if and when there's actual demand.

- **Pro tier — multilingual embeddings.** `BAAI/bge-m3` (~568 M params, ~600 MB q4) + optional reranker. Unlocks: semantic manuscript search ("find passages that echo this paragraph"), duplicate-phrase detection, graveyard resurrection hints, character voice-drift. Pure analytical — no generation, no hallucination risk; WASM-viable (encoder, not autoregressive). Needs a vector-storage layer in IDB and an embeddings API in `src/ai/`. Philosophy fit: perfect.

## Novel-first output (captured 2026-04-21)

Minimum-viable cut shipped 2026-04-22 (commit `5e6851c` — novel-first PDF/DOCX/EPUB + per-document dialogue style; commit `24c9baa` — novel-style Markdown). One follow-on remains, gated on whether the shipped exports actually close the gap in real use:

- **Export templates.** User-editable presets (book / manuscript / screenplay) with per-document overrides for font, margins, scene-break glyph, and chapter page-break behavior. Anchor, not commitment. Right place to land "can you make the PDF look like X?" requests once the first cut has been lived with for a while.

## Character feature depth (captured 2026-04-21)

Minimum-viable doorway shipped 2026-04-22 (commit `63e69d8` — character profile page with mention-dot doorway + description field; commit `dacb0d0` — collapsible mentions and dialogue sections). Two expansion items remain, both contingent on the shipped doorway actually feeling thin in practice rather than ahead of demand:

- **Richer character model (only if the page still feels hollow).** Further optional fields once the page has earned them: `role: 'protagonist' | 'antagonist' | 'supporting' | 'minor'`, `arc_intent` (free text), relationships, voice notes, appearance, goals/fears. Don't add any of these without evidence the current `description`-only shape is too thin — more fields with no destination deepens the tag-ness rather than closing it.
- **Cast ordering by role (only after the richer model lands).** Sidebar character list groups/sorts by role (protagonist first, minors last). Only meaningful once `role` is populated in practice.

## Measurement & QA

_(Empty — main chunk is back under the 130 KB gate at 101.53 KB gzip after lazy-loading the sync settings tab + the dev menu on 2026-04-28.)_

## Phase 3+ hooks

These are "future feature anchors" — plumbing that unlocks a feature later rather than standalone work.

- **Sentence rhythm via `walkLineRanges`** for Story Pulse. Real per-line breakpoints from pretext instead of guessing from sentence lengths.
- **`@chenglou/pretext/rich-inline`** for character @mentions, code spans, chips in dialogue blocks.

## Block revision history — open follow-ups from v0.6.0 (captured 2026-05-01)

The bigger rework (sparse snapshots, click-to-preview UX, mini-diff rows, preset selector) shipped on `master` as v0.6.0. The three minor items the final code review flagged shipped as v0.6.2 (see Done section). One open angle remains as genuine future work:

- **Coverage — cross-block edits.** Revisions are still per-block, so paste-split, type change, and soft-delete-to-graveyard don't show as a coherent timeline anywhere. Big design question (what does "block identity" mean across a paste-split?), not a near-term fix.

## Sync hardening — deferred design-level items (captured 2026-04-27)

Came out of the post-ship security audit on `feat/sync` (commit c2ae716). The mechanical findings (passphrase entropy, RL-before-KV, modulo bias, 401-vs-404, feedback honeypot bypass, Discord markdown escape) shipped the same day. **U1 and the in-memory half of I1 shipped 2026-05-01** — the remaining items below are the still-open ones.

- **L1 — Paircode TOCTOU.** Server does `KV.get` then `KV.delete` on `paircode:*` non-atomically; concurrent redeems can both pass the read. Fix needs either Durable Objects (atomic single-shot) or making the paircode self-validating via server-HMAC instead of pointing into KV. **Practical impact is near-zero** — what double-redeem leaks is `(syncId, salt)`, useless without the passphrase. Park unless we hit a real abuse case.
- **L4 — Sync keys plaintext in IndexedDB.** `K_enc` / `K_auth` raw bytes live in the `sync_keys` store unencrypted. **Partially mitigated by I1's in-memory refactor** (the in-memory CryptoKey is non-extractable so a heap-only XSS can't dump it), but the bytes are still on disk and an XSS that can read IDB still wins. Three options when picked up:
  1. Re-derive on every app boot from the passphrase (no persistence). Costs ~1 s of Argon2id per launch + UX prompt every time. Smallest design change.
  2. WebAuthn PRF / device-bound non-extractable wrap. Biometric/PIN unlock at boot. Native to the web platform but adds a UX dependency on the user's authenticator.
  3. **Right answer when the platform layer ships** — route storage through the Tauri/Electron OS keystore (Keychain / DPAPI / libsecret). Web build keeps current behavior. This is the natural pairing with the existing platform-layer plan.
- **I1 storage half — wrap the IDB bytes.** The in-memory half shipped 2026-05-01 (`importEncKey` + non-extractable `CryptoKey` plumbed through `encryptBundle` / `decryptBundle` / engine). The **storage half** — keystore persisting wrapped material instead of raw bytes — is not done. It's gated on solving where the wrapping key comes from, which is the L4 question. Fold this into whichever L4 option is picked up.
- **I2 — No key rotation / revocation.** If the passphrase or a paired device leaks today, only path is `destroyCircle` + re-pair, and any blob the leaker already downloaded is forever readable to them. Real fix is a rotation protocol: derive `(salt', K_enc', K_auth')`, re-encrypt every blob client-side and PUT, server swaps `auth_proof'` (new authed endpoint), other devices re-pair under new passphrase. Once started, this drags in per-device subkeys, an epoch counter, and a re-encrypt-on-rotate background job. Multi-day spec — capture as a "second-version-of-sync" item, not a near-term fix.

Recommended ordering when revisited: I1 storage half folded into L4 option 3 alongside the platform layer, then I2 if there's ever a documented incident that needs it. L1 stays parked.

## Local-first durability — shipped 2026-05-01

Storage quota visibility + persistent storage request both shipped — see the Done section below. Only one related item remains, parked:

- **Eviction recovery (out of scope, follow-on).** If the browser ever does evict IDB despite persistent storage being granted, sync users could in principle re-fetch from R2 to rebuild local state. Not currently triggered in the wild and a much bigger item than the durability fixes that just shipped — capture for whenever a real incident makes the case for it.

## Operational visibility — adjacent open question (captured 2026-04-28)

Both error reporting (user→operator) and announcements (operator→user) shipped on 2026-05-01. One open follow-up:

- Should criticals in the announcements channel support a graceful-degrade "read-only mode" toggle (operator-set: app loads in read-only until the announcement clears) for sync-schema breaks? Probably yes eventually, but a follow-up — not the first cut.

## Done — 2026-05-01 (single push, eight items + adjacent polish)

Heavy session. The first three are the original "ASAP" triage; the next two are the local-first durability cluster; the next three are the next-tier triage; the last two are adjacent polish that landed cleanly with the rest. Versions used the small-bump cadence so each cluster gets its own `whats-new` tab even though they all rode in one deploy: v0.3.0 → v0.3.1 → v0.4.0 → v0.4.1.

- **Backup import resilience.** Previously, a bundle could fail validation when a chapter was hard-deleted while a soft-deleted block in it lingered (`block.chapter_id` ended up pointing at a phantom chapter). The validator now tolerates that for soft-deleted rows; the importer re-points the live `chapter_id` to `deleted_from.chapter_id` (or any surviving chapter); `deleteChapter` repoints in-DB graveyard rows on hard-delete so future bundles stay clean. Also: dialogue blocks with `speaker_id: ''` (the unassigned sentinel) are accepted instead of rejected. `src/backup/format.ts` + `src/backup/import.ts` + `src/db/repository.ts:repointDeletedBlocksForDeletedChapter` + 3 new tests.

- **Service worker update prompt.** PWA was on `registerType: 'autoUpdate'`, which auto-skip-waitings behind the user's back and throws away in-flight keystrokes. Switched to `'prompt'` mode; a sticky info-toast surfaces with a Reload action when `registration.waiting` fires, `skipWaiting` only on explicit click. Toast surface gained a generic `withAction` API that takes `{ label, handler, keepOpen }`. `vite.config.ts` + `src/ui/shared/sw-update.ts` + `ToastHost.tsx` + `toast.ts`.

- **CrashBoundary "Copy diagnostic info" button.** Crash screen now copies a sanitised Markdown-fenced summary (build identity, locale, AI profile, last-active doc id, error + stack, UA) — explicitly NO block content, character names, document titles, or syncId. Falls back to a select-all textarea when the Clipboard API is unavailable. EN + HU. `src/utils/diagnostic.ts` + `CrashBoundary.tsx`.

- **Storage quota visibility (Settings → Advanced).** "247 MB used of 500 MB (49 %)" via `navigator.storage.estimate()`. Falls back to "{used} used" when quota is unknown, and to a friendly "browser doesn't expose this" message on Safari. `src/utils/storage.ts` + `SettingsAdvancedTab.tsx` + 23 unit tests.

- **Persistent storage request.** `navigator.storage.persist()` quietly fired the first time the user successfully exports anything (download is a moment of commitment), with the outcome recorded in `inkmirror.storage.persistAsked` so we never nag. Manual "Request protection" button on Settings → Advanced for users who missed the auto-trigger. Browser-dialog flavours degrade gracefully (Chrome/Edge often silent, Firefox prompts, Safari returns false). Hook in `downloadBlob`.

- **U1 — best-effort deletion → confirmed deletion (privacy-promise gap).** `destroyCircle` now returns `{ kind: 'completed' | 'pending' }` instead of `void`. Local keys only wiped on 200 / 204 / 404; on any other outcome (offline, 5xx, 401 drift) a `pending_deletion` marker is persisted to localStorage, status flips to `pending_deletion`, and a background scheduler retries on `online` events + every 60 s while online. Marker survives reload — re-armed in `engine-bootstrap.ts`. New `Settings → Sync` panel with Retry now + Force clear locally escape hatch. `src/sync/pending-deletion.ts` + 6 new tests across `pairing.test.ts` + `engine-bootstrap.test.ts`.

- **Settings → Privacy tab (structural slot).** New tab: short "What InkMirror sees" summary linking to `/privacy`, sub-processor list mirror (Cloudflare / Hugging Face / Discord), empty "Opt-in features" section ready to host the GlitchTip / announcements toggles when those land. Lazy-loaded so the empty-for-now slot doesn't drag into the main chunk. Sequenced ahead of GlitchTip so future opt-ins have a home.

- **Announcements channel (operator → user push).** Anonymous pull from `/announcements.json` (static asset, ETag-cached, Worker-served). Severity matrix: info → toast, critical → blocking modal until acknowledged. Three triggers: boot, `visibilitychange` → visible (5 s debounced), 15-minute interval while visible. Fields: `id`, `severity`, per-locale `title`/`body` (inline strings, NOT i18n keys, so authoring doesn't need a redeploy), `publishedAt`, `expiresAt`, `minVersion`/`maxVersion`, `link`. Defensive caps: 1 critical / 3 infos per boot. Dedup state stores only ids (`inkmirror.lastSeenAnnouncementInfo` watermark + `inkmirror.acknowledgedCriticals` set). Preview path: `?announcements=preview` loads `/announcements-preview.json` and bypasses dedup. Empty `public/announcements.json` shipped — operator's guide for publishing lives at `docs/announcing.md`. `src/announcements/*` + `CriticalAnnouncementModal.tsx` + 29 unit tests.

- **I1 partial — non-extractable `CryptoKey` in memory.** `encryptBundle` / `decryptBundle` now take a `CryptoKey` instead of raw bytes. New `importEncKey()` imports as `extractable: false`, AES-GCM, encrypt+decrypt. `keystore.loadKeys()` returns the imported CryptoKey on read; raw bytes are zeroed after import. Engine + bootstrap typed accordingly. Test asserts `crypto.subtle.exportKey()` rejects on the imported key. **The storage-side half (wrapping the bytes in IDB) is still open** — see the Sync hardening section above; folded into L4 because both need the same wrapping-key answer. K_auth stays as raw bytes because it's used as a Bearer token (functionally exported by design).

- **Color picker for characters (adjacent polish).** Character profile page got a real color picker — 12-swatch curated palette (the existing brand 6 + 6 expanded shades, all tuned for vellum + dark legibility) plus a rainbow-wrapper around `<input type="color">` for free-form custom picks. Already-existing `character.color` field, so propagation to speaker pill, dialogue tint, mention dot, scene-metadata chip, plot-timeline pill, sidebar swatch, and the character-arcs chart is automatic. `src/ui/shared/ColorPicker.tsx`.

## Done — 2026-05-01 (v0.6.2 — revision history polish)

Three minor follow-ups from the v0.6.0 ship, bundled into one release per the small-bump cadence:

- **Dropped orphaned `restoreBlockContent`.** Re-export at `src/store/document.ts` and the underlying function in `document-blocks.ts` were dead after the BlockHistory refactor swapped to `enterPreview`. Both removed; the `persistBlockNow` import in `document-blocks.ts` (only used by the deleted function) was also dropped.
- **Ticking `now` in the popover.** Lifted the relative-timestamp clock to the parent `BlockHistory` as a Solid signal that re-ticks every 30 s while the popover is open (and stops when it closes). `BlockHistoryRow` now takes an optional `now` prop and falls back to `Date.now()` so existing tests stay untouched. One `setInterval` per popover instead of one per row.
- **⟲ button in the command palette.** Added a `Block revision history` entry to the palette that opens the popover for whichever block had the cursor when the palette was invoked. CommandPalette's open-effect captures `document.activeElement.closest('[data-block-id]')` before the input grabs focus on `queueMicrotask`. Dispatch goes through a small module-level signal `openRequest` in `BlockHistory.tsx`; the per-block `createEffect` listens for its own blockId and self-clears the signal so re-firing the same blockId works. Reuses the existing `misc.revisionHistory` i18n key — no new strings.

## Done — 2026-05-01 (v0.6.1 — mood label literary polish)

- **Mood labels with more literary weight.** Long-deferred backlog item. EN side: three labels enriched to match the register HU already had — `Longing → Yearning` (matches the *ache*, not just the verb), `Wonder → Awe` (matches `áhítat`-style reverence already used in marketing prose), `Calm → Stillness` (settled-repose, matches `Nyugalom`'s feel). HU side then revisited as planned: two labels aligned with the literary variants the marketing prose already used — `Vágyódás → Vágyakozás` (active form, what `whats-new` HU prose said all along), `Csoda → Áhítat` (reverent awe instead of "miracle/marvel"; matches the new EN `Awe`). `Nyugalom` kept — `Csend` would mean silence, too narrow for Stillness. Marketing copy at `en.ts:525` re-aligned to mention the new labels (`tender, dread, yearning, awe, grief, stillness`) so prose and labels stop disagreeing. Display only — internal `Mood` keys (`'tender'`, `'rage'`, etc.) unchanged, so AI labels, audio engine routes, DB values, and the heatmap palette all stay put. Five judgment-call swaps untaken: `Tender / Tension / Dread / Grief / Hope / Joy` already at the right register both sides; `Rage → Wrath` deliberately deferred because Hungarian `Harag` ≠ EN `Rage` (it's closer to wrath); cross-language semantic mismatch flagged but parked because the change reads heavier than the umbrella label intends. `whats-new` v0.6.1 entry in both locales explains the swaps and the no-data-impact framing. `package.json` 0.6.0 → 0.6.1.

## Done — 2026-05-01 (v0.5.0 — GlitchTip)

- **GlitchTip (self-hosted error reporting), opt-in.** Sentry-protocol-compatible self-hosted instance live at `glitchtip.peteriadamgabor.com` (Docker compose, official sample). `@sentry/browser` lazy-imported only when the user has flipped the toggle in Settings → Privacy → "Send crash reports" — the SDK pays zero bytes for users who never opt in. `beforeSend` reuses the same allow-list as `src/utils/diagnostic.ts` (build identity, locale, AI profile, UA) and strips `breadcrumbs`, `user`, `request`, `extra`, `tags`. `beforeBreadcrumb` returns null so input/URL breadcrumbs can never carry typed text. Toggle storage in `localStorage['inkmirror.errorReporting']` ('on' | 'off' | absent → off). Sub-processor row added to the Privacy tab (4th row, "GlitchTip (self-hosted)"). CSP `connect-src` extended unconditionally — the SDK only fires when the toggle is on, so per-user gating wasn't needed. EN + HU strings throughout. `src/utils/glitchtip.ts` + `SettingsPrivacyTab.tsx` + `security-headers.ts` + `index.tsx` boot wiring.

## Done — 2026-04-28 (audit reconciliation)

Items that had quietly shipped but were still listed as open in earlier passes. Caught during the eighth-pass full feature rescan. Evidence in parens.

- **Novel-first exports (minimum-viable cut).** PDF / DOCX / EPUB / Markdown rework so output reads as continuous prose instead of script-shaped: text blocks merge into paragraphs, dialogue renders inline with quote marks via `formatDialogueProse`, scene blocks render as `* * *` centered breaks with metadata hidden from the visible output. Per-document dialogue style setting (straight quotes / curly quotes / Hungarian dash). Note blocks skipped in exports. Fountain stays screenplay-shaped intentionally. Scene block reshape and export templates remain open as conditional follow-ons. Commits `5e6851c` (PDF/DOCX/EPUB) + `24c9baa` (Markdown).
- **EPUB cover image.** Document settings carry a `cover_image` data URL; `src/exporters/epub.ts` lines 263–272 embed it in the zip with the right MIME type, lines 160–165 add `properties="cover-image"` to the OPF manifest item plus the corresponding `<meta>` pointer. No new in-app cover block type — the existing cover-page chapter kind handles that surface separately. Commit `24c9baa`.
- **Character profile page (minimum-viable doorway + description field).** `src/ui/features/CharacterPage.tsx` opens from a mention dot or character pill; shows profile (name, color), description, every dialogue line, every block they're mentioned in (deep-linked), chapter range, POV status. `description?: string` added to `src/types/character.ts`. Collapsible mentions + dialogue sections shipped right after (commit `dacb0d0`). Inline POV star + trash on character rows replaced the older overflow-menu (commit `fb11425`). The richer character model (`role`, relationships, etc.) and cast-ordering-by-role remain open as conditional follow-ons. Commit `63e69d8`.
- **Sync connection / status pill.** `src/ui/features/sync/SyncStatusPill.tsx` renders a status chip in the editor header with states `idle` (✓ synced Xm ago), `syncing` (⟳), `pending` (queued), `conflict` (⚠), `error` (!). Pure client-side state derived from the existing sync engine, no new server calls. Last-sync timestamps also persisted and shown in the document picker (commit `c31eed1`). Closes the "sync status dot" UX gap that was reopened during the 2026-04-28 audit. Commit `2472e86`.

## Done — 2026-04-28

- **What's new panel + v0.1.0 release flow.** Sparkle button next to the language picker (DocumentPicker + Editor top bar) opens a modal listing entries from `src/i18n/whats-new.ts`. Unread badge fires when `LATEST_WHATS_NEW_ID` (highest entry id across locales, computed at build time) is greater than `localStorage['inkmirror.lastSeenChangelog']`; first-boot users start caught up so we don't badge on first launch. Build identity baked in via vite `define` from `CF_PAGES_COMMIT_SHA` / `GITHUB_SHA` / git fallback, surfaced in the modal footer. CLAUDE.md gained a "Releasing to master" section codifying the bump-version + add-changelog-entry rule.
- **What's new modal — version tabs.** Flat scrolling list converted to tabbed layout mirroring `SettingsModal`: left rail lists version tokens (parsed from each entry's `v0.1.0` prefix, falling back to the date id) newest-first; the right pane shows the active version's items. `activeId` signal defaults to `LATEST_WHATS_NEW_ID` on every open so unread users land on the freshest tab; a guard keeps the selection valid if a locale change yields a list that doesn't contain the previous active id. No data-shape change.
- **Lazy-load sync settings tab.** `SettingsSyncTab` now goes through `lazy()` in `SettingsModal.tsx` with a `<Suspense>` "Loading…" fallback. Defers `SettingsSyncTab.tsx` (303 lines) plus `PairingSetupModal.tsx`, `PairRedeemModal.tsx`, `wordlist.ts`, and `strength.ts` into a 5.77 KB gzip chunk that only loads when the user clicks the Sync tab. First win against the main-chunk-over-gate item — paired with the dev-menu lazy mount it dropped main from 150.32 KB to 101.53 KB gzip.
- **Block-type filter in word count.** Three-chip toggle row above the totals (text / dialogue / scene), defaults to all on, last active chip can't be turned off. When non-default, `stats().total` and `stats().chapter` reflect only active types, the dialogue/narration split bar hides (would misrepresent a partial set), and the violet "+N this session" tag is suppressed (baseline was captured against the unfiltered total). Pulse dashboard intentionally excluded — its keystroke aggregator doesn't tag bursts by block type, so a per-type filter there would need worker-side changes beyond this minimum-viable cut.
- **Dev-mode threshold-tuning menu.** Closed the spec at `docs/superpowers/specs/2026-04-27-dev-menu-design.md`. Hidden behind `localStorage["inkmirror.dev"] = "two-hearts-one-soul"` + reload; `isDevModeEnabled()` Solid signal exposes the gate. `dev-threshold.ts` owns a clamped [0.30, 0.95] override with default 0.75; `inconsistency.doScan` snapshots it at scan start so a slider change mid-scan doesn't split results. `ScanOptions` gained `dryRun` + `onPairScored`; production path unchanged when neither is set. `runInstrumentedScan` wraps a dryRun with the per-pair callback and aggregates `pairs / totalScanMs / averagePairMs / slowestPairMs / candidatePairCount / detectedLang / threshold`. Modal (`DevMenu.tsx`, lazy-imported, 4.29 KB gzip) renders slider + score histogram (bin 0.05, click to filter tables) + above-threshold table + near-misses table (≥ 0.30) with click-to-expand NLI breakdown + pipeline stats grid + trigger-category bar chart. Override badge in `ConsistencyPanel` header opens the modal. NLI shape stayed two-class `{entailment, contradiction}` — the spec assumed three but the worker drops the neutral class at the boundary.

## Done — 2026-04-27

- **Chunk-split sanity check.** Reran `vite build --mode analyze`. All heavy export libs still isolated in dynamic chunks (jspdf 129.67 KB gzip, jszip 28.44 KB, docx 114.43 KB, ai-worker 519 KB raw, ort-wasm 5.8 MB gzip, libsodium-wrappers 189.13 KB gzip). New finding — main `index` chunk grew past the 130 KB spec gate to 150.32 KB gzip after the sync feature shipped; captured as a fresh Measurement & QA item rather than buried in this Done line.
- **Real-Chrome re-measurement.** Author tested on their own display on 2026-04-27, no regressions observed. Closing the item — re-open if a perf regression surfaces in real use.
- **Memory leak check.** Author tested in real-world use on 2026-04-27, no leaks observed. Closing the item — re-open if heap growth shows up in long sessions.

## Done — 2026-04-19 → 2026-04-22

Shipped since the last backlog clean. Some of these weren't on the backlog at all (keyboard work, hf-proxy fix); one chipped away at a listed item (PDF typography) without closing the whole thing.

- **Idle-driven background consistency scan.** New `src/ai/idle-scheduler.ts` subscribes to keystroke activity via a lightweight `subscribeToKeystrokes` slot on `pulse-client`. After 15s without typing, if profile is `deep` and the doc has characters, it runs `runConsistencyScan` with an `AbortController`. Resumed typing aborts the in-flight scan (the existing `signal.aborted` check in `ai/inconsistency.ts` handles clean bail). 2-minute cooldown prevents back-to-back scans. Priority queue keyed by characterId deferred per `feedback_keep_it_simple` — full-scan-on-idle is the minimum viable version.
- **Near tier E2E specs.** `e2e/consistency-flag.spec.ts` seeds a flag into IDB, reloads, and asserts the Consistency panel renders it → dismiss moves it to the "Dismissed" list → reactivate brings it back. `e2e/profile-revert.spec.ts` covers Settings → AI → Advanced → Revert flipping profile to lightweight and hiding the panel, plus the negative case (already-lightweight user sees no Revert button).
- **Inconsistency edit-invalidation bug fix.** The 2026-04-18 ship of "any flag whose stored hash differs from the fresh content is stale — delete it" didn't actually work: `existing.content` in `updateBlockContent` is a Solid store proxy, which reads the *updated* value after the `setStore`, so the inequality check was always false. Snapshotted `prevContent` as a primitive string before mutation; 5 new unit tests cover the path (block_a edit → removed, block_b edit → removed, unrelated edit → kept, same-content rewrite → kept, multi-flag cascade).

- **PDF Hungarian ő/ű glyph bug fixed.** jsPDF's default `times` font used WinAnsi encoding and could not render Hungarian ő/ű/Ő/Ű — characters collapsed to `Q`/`q` and the broken width measurement cascaded into letter-spaced wrapping. `exporters/pdf.ts` now loads a bundled Noto Serif TTF (all four variants) and registers it via `jsPDF.addFont`. Commit `738c1e1`. **Note:** the broader "PDF typography" backlog item was split — the Hungarian-glyph half is done; the novel-style rendering path now lives in the new "Novel-first output" section above.
- **Noto Serif font subsetting.** First version shipped the full 440 KB × 4 variants. Switched to subsetted fonts via `pyftsubset` (Latin + Latin Extended-A/B + common punctuation), cutting each variant to ~75 KB — 84% reduction, ~2 MB off the production bundle. Commit `1e70547`.
- **Full keyboard editing suite.** Alt+1..4 cycles block types (`e29e69a`), Ctrl/Cmd+D duplicate + Ctrl/Cmd+Shift+Enter insert-above + Ctrl/Cmd+Backspace delete + `/` slash menu for block-type switching on empty blocks (`d0b4ec1`), documented read-only under Settings → Hotkeys with EN+HU strings (`cde75ab`). Tests cover intent detection, slash-menu filtering, and the new store functions.
- **Block timestamps + POV dialogue visual refresh.** Commit `891f155`.
- **hf-proxy redirect fix.** HuggingFace resolve endpoint started 307'ing to same-origin `/api/resolve-cache/...` paths. The Worker's `redirect: 'manual'` branch only handled absolute `huggingface.co/...` targets, so every model config.json returned 404 and the Rich profile (mDeBERTa) could not load in production. Switched to `redirect: 'follow'`; incoming-path regex and content-type allowlist remain the safety net. Commit `00ed56c`.

## Done — audit pass 2026-04-18

Items that were on the backlog above but turned out to have quietly shipped. Evidence links in parens.

- **Inline bold / italic marks** — Cmd+B / Cmd+I via `applyMarkToggle` in `BlockView.tsx:343`, `Mark` type in `types/block.ts`, normalizer + tests in `engine/marks.ts`, all six exporters consume marks.
- **ResizeObserver fallback** — 500 ms `setInterval` fallback path in `Editor.tsx:148`.
- **Scroll anchoring during active wheel scroll** — `isScrollIdle()` guard around `captureAnchor()` in `Editor.tsx`.
- **ADR-002 pretext correction** — Correction section added to `05-ROADMAP-AND-ADR.md:181`.
- **ADR-007** (ResizeObserver + scroll-anchor pattern) — at `05-ROADMAP-AND-ADR.md:241`.
- **ADR-008** (chunk-split export pipeline) — at `05-ROADMAP-AND-ADR.md:262`.
- **Pretext API cheat sheet** — `docs/pretext-research.md`.
- **Per-character sentiment (dominant label)** — `CharacterSentiment.tsx`. The full time-series arc version is still open above.
- **Dialogue-only word counts** — `WordCount.tsx:71-89` renders dialogue/narration split with percentage + progress bar.
- **Reading-time estimate** — `WordCount.tsx:65-70` shows total + per-chapter read time at 250 wpm.
- **DOCX proper `styles.xml`** — `exporters/docx.ts:193-234` ships a full `paragraphStyles` block (SceneHeading, DialogueSpeaker, DialogueBody, Parenthetical) plus defaults for heading1/heading2/title. Word's outline view and style-swap work.
- **Fountain CONT'D for PDF** — shipped 2026-04-18 in the UI/export polish pass. PDF now appends `(CONT'D)` on consecutive same-speaker dialogue, matching Fountain behavior. CONT'D resets on non-dialogue blocks and chapter boundaries.
- **Shift+Enter soft-newline** — verified 2026-04-18. `keybindings.ts:resolveKeyIntent` returns null for `shift+Enter`, contenteditable inserts `<br>`, `parseMarksFromDom` converts `<br>` to `\n`, `marksToHtml` preserves `\n` on re-render, `measure.ts` passes `whiteSpace: 'pre-wrap'` to pretext. Tests in `engine/marks.test.ts` cover the round-trip.
- **Toast history / action log** — `toast.ts` ships a 20-entry ring buffer; `ToastHost.tsx` renders a history popover with time-ago stamps, kind icons, and a "clear" button. Anchored to bottom-right next to the toast stack, shown when history is non-empty and no active toasts.
- **EPUB structural validator** — shipped 2026-04-18. `epub.test.ts` unzips the generated EPUB and asserts mimetype contents, container pointing at a real OPF, required DC metadata (`dc:title`, `dc:identifier`, `dc:language`, `dcterms:modified`), manifest items resolve to real files, nav document present, spine itemrefs match manifest ids. Includes a regression guard that flags a missing manifested file. Not a full `epubcheck` replacement but catches structural drift.
- **Full time-series per-character sentiment arc** — shipped 2026-04-18. `CharacterArcs.tsx` renders an SVG line chart in the RightPanel: per tracked character, averaged polarity of their dialogue blocks within each chapter, connected across chapters. Click a data point to scroll to that chapter. Dialogue-only (not narration mentions); mentions-in-narration is a future extension if useful.
- **Session notes** — shipped 2026-04-18. `SessionNotes.tsx` is a per-document scratchpad in the RightPanel, debounced-saved to `localStorage["inkmirror.sessionNotes.<docId>"]`. Deliberately outside the `.inkmirror.json` bundle — notes stay with the browser, not the manuscript. Empty notes clear the entry.
- **Auto-sweep on deep opt-in** — shipped 2026-04-18. Flipping the AI profile to Rich now fires `runConsistencyScan()` automatically after mood backfill. Scheduled via `setTimeout(0)` so the Settings modal can close before the scan's progress appears in the Consistency panel.
- **Edit invalidation for inconsistency flags** — shipped 2026-04-18. `updateBlockContent` now deletes any flag whose stored block hash no longer matches the fresh content. Re-running Check Now (or the auto-sweep) re-emerges the flag if the contradiction survived the edit.
- **Per-mood sonification** — shipped 2026-04-18. `audio/engine.ts` expanded from 3 valence profiles to 10 mood profiles tuned on a valence×arousal grid. Editor drives `setMood` live from the active chapter's dominant label so `tender`, `rage`, `dread`, etc. each get distinct tones instead of collapsing to valence. `resolveMoodLabel` coerces unknown labels to `neutral` so a stray model output can't break the audio loop.
- **Near tier opt-in E2E spec** — shipped 2026-04-18. `e2e/near-tier-opt-in.spec.ts` covers sidebar → Settings modal → Rich card → confirm dialog → localStorage write + cancel path. HuggingFace endpoints mocked via Playwright route interception so the test doesn't pull the real 80 MB model.
- **Chunk-split sanity check** — ran 2026-04-18. All heavy libs still in dynamic chunks: ai-worker 519 KB, jspdf 129 KB gzip, jszip 28 KB gzip, docx 114 KB gzip, ort-wasm 5.8 MB gzip. Main chunk 126.99 KB gzip (under the 130 KB spec gate).

## Done — refactor pass 2026-04-18

- **`speakerNameFor` extracted to `exporters/index.ts`** — was duplicated across docx / pdf / fountain / epub / markdown. Fountain keeps a thin `speakerCue` wrapper for its uppercase + 'SPEAKER' fallback.
- **`store/selectors.ts`** — centralized five chapter-scoped queries (visibleBlocksInChapter, allVisibleBlocks, dialogueBlocksForSpeaker, chapterLabelTally, dominantChapterLabel). Refactored 8 call sites (RightPanel, Editor, MoodHeatmap, CharacterArcs, CharacterSentiment, WordCount, StoryPulseEcg, ai/inconsistency, ai/index backfill). +13 new tests. Zero behavior change.

## Done — Near tier (2026-04-17 / 2026-04-18)

Shipped to origin in commits `29bca67` → `681d2e1`.

- Rich mood vocabulary (10 literary labels: tender, tension, dread, longing, grief, hope, joy, wonder, rage, calm)
- mDeBERTa-v3 multilingual NLI model via Transformers.js (q4, ~80 MB)
- WebGPU-first backend with wasm fallback; real adapter probe on detection
- Inconsistency detection pipeline (sentence split + trigger-word pruning EN+HU + symmetric zero-shot NLI via `{}` template)
- Schema v6 with `inconsistencies` object store
- AI profile state as reactive Solid signal
- Settings modal (chose modal over route mid-cycle): AI + Hotkeys + Language tabs, fade-out animation, fixed-size panel
- Consistency right-panel section: grouped flags, dismiss + reactivate, click-to-scroll, Run Now
- i18n: `mood.*` + `settings.*` + `consistency.*` namespaces in EN and HU

## Done — 2026-04-14 → 2026-04-15

Cleared in the second pass. Kept as a historical breadcrumb — delete when the list grows unwieldy.

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
