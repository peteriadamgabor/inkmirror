---
name: InkMirror
description: An offline-first novel-writing webapp that holds a mirror up to the writer
colors:
  writer-violet: "#7F77DD"
  story-orange: "#D85A30"
  vellum-page: "#f5f0e8"
  vellum-surface: "#faf6f0"
  indigo-lamplight: "#1a1723"
  indigo-lamplight-surface: "#26222f"
  dialogue-teal: "#14b8a6"
  note-stone: "#78716c"
  ink-prose-light: "#1c1917"
  ink-prose-dark: "#fafaf9"
typography:
  display:
    fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  prose:
    fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
    fontFeature: "'kern' 1, 'liga' 1, 'onum' 1"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
    fontFeature: "'smcp' 1, 'c2sc' 1"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "'tnum' 1"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.writer-violet}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 32px"
  button-primary-hover:
    backgroundColor: "#9D96E8"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.note-stone}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  button-ghost-hover:
    textColor: "{colors.writer-violet}"
  modal-panel:
    backgroundColor: "{colors.vellum-surface}"
    textColor: "{colors.ink-prose-light}"
    rounded: "{rounded.xl}"
    padding: "0px"
  card-feature:
    backgroundColor: "{colors.vellum-surface}"
    textColor: "{colors.ink-prose-light}"
    rounded: "{rounded.xl}"
    padding: "24px"
  block-container:
    backgroundColor: "transparent"
    textColor: "{colors.ink-prose-light}"
    typography: "{typography.prose}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  input-text:
    backgroundColor: "transparent"
    textColor: "{colors.ink-prose-light}"
    typography: "{typography.prose}"
    rounded: "{rounded.sm}"
    padding: "4px 0px"
---

# Design System: InkMirror

## 1. Overview

**Creative North Star: "The Two-Heart Mirror"**

InkMirror is built on a single image: two hearts and a mirror. The writer's heart is **violet** (`#7F77DD`). The story's heart is **orange** (`#D85A30`). The surface between them — paper, screen, glass, prose — is the mirror, and the app's job is to hold that mirror steady. Every visible decision serves this metaphor: the warm cream pages let the violet feel like ink-on-vellum, the dark mode reads as a desk lamp at midnight (not a terminal), and the only literal animation in the marketing surface is a serif word breathing in its own reflection.

This system rejects, by name, the four directions InkMirror's category trains AI tools to drift toward: **Sudowrite/Novelcrafter** (generative-AI-coauthor SaaS — the writer's prose is sacred, the AI never drafts), **Notion/Google Docs** (bland infinitely-flexible blocks with no opinion), **Scrivener/yWriter** (toolbar-heavy '90s power-user cockpit), and **Linear/Vercel/AI-startup landing pages** (indigo-purple gradients, hero-metric cards, glassmorphism, "Built with [logo] [logo]" trust strips). Sentiment analysis is rendered as a literal ECG and a heatmap and a per-character sparkline because that is what a reading instrument looks like — not as "AI insights."

The visual register is **two surfaces, one soul**: the editor (light vellum, calm, almost no chrome) and the public landing (deep Indigo Lamplight, dramatic serif, mirror reflection). They are register-different but soul-identical.

**Key Characteristics:**
- Editorial serif everywhere prose appears; system sans only for chrome.
- Two hot colors in the entire system — violet (writer) and orange (story) — used only when the writer↔story connection is what the surface is about.
- Warm-shifted neutrals: Vellum (cream) light, Indigo Lamplight (warm violet-stone) dark. No `#fff`, no `#000`, no Tailwind `stone` left raw on a primary surface.
- Three-tier soft elevation that never goes opaque-black, even in dark mode.
- Quiet by default: block chrome resolves to 25% opacity until hover/focus.
- Real OpenType small-caps and old-style numerals in prose; tabular numerals on every counter.
- Motion is small, fast (140-180ms), and exponential — except mirror-breath, which is 6s and meant to be subliminal.

## 2. Colors: The Two-Heart Palette

The palette is deliberately small. Two hot colors carry the metaphor; everything else is a warm-shifted neutral. Anything outside this list earns suspicion.

### Primary
- **Writer Violet** (`#7F77DD`): The writer's heart. Used on focus rings, primary CTAs, drag-drop drop-targets, search-match flash, the active-character highlight, the "writer" half of the two-hearts hero icon. Never decorative. If a surface reaches for violet without reason, take it back.

### Secondary
- **Story Orange** (`#D85A30`): The story's heart. Used on scene-block markers, the "story" half of the two-hearts hero icon, the sentiment-heatmap warm pole, and exactly nowhere else in the chrome. Story-orange showing up on a button, link, or unrelated surface is a bug.

### Tertiary
- **Dialogue Teal** (`#14b8a6`): Used only as the unassigned-speaker fallback tint on dialogue blocks before a character color is bound. Once a character is assigned, the speaker's own color (mixed in inline via `color-mix`) takes over. Teal is a "no-one's-talking-yet" placeholder, not a brand color.

### Neutral
- **Vellum Page** (`#f5f0e8`): The light-mode background. Replaces Tailwind `stone-100` / `bg-white` app-wide via CSS overrides — every neutral surface in light mode is warm-shifted to read as old paper.
- **Vellum Surface** (`#faf6f0`): The light-mode floating-island surface (modals, cards, the document picker). One step warmer-and-paler than the page so layered surfaces read by tone, not by border.
- **Indigo Lamplight** (`#1a1723`): The dark-mode background. Stone-900 with a faint indigo undertone — "reading lamp," not "terminal."
- **Indigo Lamplight Surface** (`#26222f`): The dark-mode floating-island surface. Same indigo shift applied to stone-800.
- **Note Stone** (`#78716c` / Tailwind `stone-500`): The italicized prose color of `note` blocks (which are not exported). Also the resting color of secondary UI text.
- **Ink Prose** (`#1c1917` light / `#fafaf9` dark): The base prose color. Stone-900 / stone-50; never raw black or white.

### Named Rules

**The Two Hot Colors Rule.** Writer Violet and Story Orange are the only two saturated colors in the entire chrome. If you find yourself reaching for a third (red for danger, green for success, blue for info), use a stone-toned neutral plus an icon or copy first. Add a third hot color only with explicit justification.

**The Warm Neutral Rule.** No `#fff`, no `#000`, no raw Tailwind `stone-*` on a top-level surface in light or dark mode. The CSS layer in `src/index.css` rewrites `bg-stone-100` / `bg-white` / `bg-stone-900` / `bg-stone-800` to the Vellum and Indigo Lamplight values. Reach for `bg-vellum` mentally — if you literally type `bg-white`, the CSS makes it warm; trust the system.

**The Feature-Color-At-Feature-Surface Rule.** A color appears at the surface that owns the feature, not as decoration elsewhere. Story Orange marks scene blocks because scenes ARE story. Writer Violet marks focus and selection because focus IS the writer's attention. Do not scatter either accent across unrelated UI for "branding."

## 3. Typography: Editorial Serif, System Sans

**Display Font:** `ui-serif, Georgia, Cambria, Times New Roman, Times, serif` — system serif chain. The user can override per-document via Document Settings → Typeface.
**Body / UI Font:** `ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif` — system sans, never custom-loaded.
**Mono Font:** `ui-monospace, SF Mono, JetBrains Mono, Cascadia Code, Menlo, monospace` — counters, code, and the build-identity footer.

**Character.** Editorial without being precious. The serif is doing real work — old-style proportional numerals, kerning, ligatures, real OpenType small-caps where the face supports them — but it stays a *system* serif so the app is fast, offline, and respects the user's font choices. The contrast is functional: prose is serif (because reading is the job), chrome is sans (because chrome should disappear).

### Hierarchy
- **Display** (400, `clamp(2.5rem, 7vw, 4.5rem)`, line-height 1): Landing hero (`InkMirror`), 404 hero, marketing section openers. Tracks tight (`-0.02em`).
- **Headline** (400, 1.875rem / `text-3xl`, line-height 1.15): Section headings on landing, document picker title, settings page titles.
- **Title** (400, 1.125rem / `text-lg`, line-height 1.4): Modal headers, dialog titles, panel headings.
- **Prose** (400, 1rem, line-height 1.65, **`'kern' 1, 'liga' 1, 'onum' 1`**): The editor body. Old-style numerals (digits sit on varied baselines like lowercase letters), proportional spacing, kerning, ligatures. This is the most precious type setting in the app.
- **Body** (400, 0.875rem / `text-sm`, line-height 1.5): UI sans for buttons, menus, secondary text, panel chrome.
- **Label** (500, 0.75rem, letter-spacing 0.08em, **`'smcp' 1, 'c2sc' 1`**): The `.inkmirror-smallcaps` class. Real OpenType small-caps with synthetic-uppercase fallback; used on column headings, badge text, sidebar group labels.
- **Mono** (400, 0.75rem, **`'tnum' 1`**): Tabular numerals on word counts, reading-time estimates, and the build-identity footer. Digits never jitter when they update.

### Named Rules

**The Old-Style-In-Prose Rule.** Numerals inside `[data-editable]` (the prose surface) use old-style proportional figures (`'onum' 1`). Numerals on counters and dashboards use tabular figures (`'tnum' 1`). Never mix the two on the same surface.

**The Real-Small-Caps Rule.** Use `.inkmirror-smallcaps` instead of CSS `text-transform: uppercase` for any label that reads as a heading or category. The class falls back to synthetic uppercase on faces without `'smcp'`, but where the face supports it, you get real small-caps. Do not scatter `uppercase` utilities — they will look cheap next to the labels that *aren't* cheap.

**The Serif-For-Prose-Sans-For-Chrome Rule.** If text is something the user wrote (or the AI is reflecting back about something the user wrote), it's serif. If text is interface (buttons, menus, settings labels), it's sans. The contrast is the system. Do not unify them "for consistency" — the inconsistency is the point.

## 4. Elevation: Soft Layered, Never Floating

InkMirror uses **soft layering** — three elevation tiers, all low-chroma, all stone-tinted. Never harsh, never opaque-black, never used to "lift" something off the page for no reason. Surfaces are flat at rest in the editor; elevation appears for floating-island affordances (modals, popovers, the document picker) where there's a real spatial relationship to the page beneath.

Borders carry a parallel three-tier vocabulary (rest / active / modal) that pairs with the shadow scale.

### Shadow Vocabulary
- **`--elev-1`** (`0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.06)`): The barest hint of lift. Used on sidebar items, hover states for inline cards, tooltips. Often invisible on first look — that's intentional.
- **`--elev-2`** (`0 2px 6px rgba(28, 25, 23, 0.06), 0 4px 12px rgba(28, 25, 23, 0.08)`): The default for floating chrome — popovers, dropdowns, the command palette.
- **`--elev-3`** (`0 12px 24px rgba(28, 25, 23, 0.12), 0 24px 48px rgba(28, 25, 23, 0.14)`): The full floating-island lift used on modals (`shadow-2xl` on the panel). Big, soft, reads as "this is a separate plane."

In dark mode, the same scale uses pure `rgba(0,0,0,...)` at higher opacity (0.3-0.55) instead of stone-tinted at lower opacity. Lights-off shadows are darker and softer; this is correct — lit objects in a dim room cast deeper shadows.

### Border Vocabulary
- **`--border-rest`** (`1px solid rgba(120, 113, 108, 0.18)`): The default 1px rule for cards, panels, dividers. Stone-tinted, low opacity, almost invisible.
- **`--border-active`** (`1px solid rgba(127, 119, 221, 0.5)`): Writer-violet at 50%. Used when a surface is in an active/selected state.
- **`--border-modal`** (`1px solid rgba(120, 113, 108, 0.22)`): A touch heavier than `--border-rest` so modals read as a discrete slab, not a popover.

### Named Rules

**The Stone-Tinted-Shadows Rule.** Every shadow value is `rgba(28, 25, 23, ...)` in light mode (warm stone tint, never neutral grey) and `rgba(0, 0, 0, ...)` in dark mode (true black, higher opacity). This keeps the warmth honest in light mode and the depth honest in dark mode.

**The Earned-Elevation Rule.** A surface earns elevation only if it floats above the page in a real spatial sense — modal, dropdown, command palette, popover. Do not put `--elev-2` on an inline card to "make it pop." Inline surfaces use border + background tone, not shadow.

## 5. Components

For each component: a one-line character note, then exact specs. Tailwind utility classes are noted in parens where they are the canonical implementation.

### Buttons
**Character:** Quiet by default, decisive on hover. The primary CTA exists to be the writer's "yes" — everything else is a ghost.

- **Shape:** `rounded-md` (8px) on small actions, `rounded-xl` (12px) on hero CTAs.
- **Primary** (e.g. landing CTA): `bg-violet-500 text-white px-8 py-3 rounded-xl shadow-lg shadow-violet-500/25` → hover `bg-violet-400`. The shadow tint is writer-violet at 25% — colored shadows are reserved for the writer's heart.
- **Action** (small, in-panel primary): `bg-violet-500 text-white px-3 py-1 rounded-lg text-xs` → hover `bg-violet-600`.
- **Ghost / Secondary** (default for non-CTA actions): `border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 px-3 py-1 rounded-lg text-xs` → hover `text-violet-500 border-violet-500`. Ghost-violet-on-hover is the standard interactive cue.
- **Icon button**: `w-7 h-7 rounded text-stone-400` → hover `text-stone-800 dark:text-stone-100 bg-stone-100 dark:bg-stone-700`.
- **Focus:** `outline: 2px solid rgba(127, 119, 221, 0.7); outline-offset: 2px; border-radius: 6px` (defined globally on `button:focus-visible`). One ring throughout the app — do not add custom focus states per component.

### Cards / Containers
**Character:** Cards are floating islands when they earn it, paper rectangles when they don't. Nested cards are forbidden.

- **Floating Island** (modal panels, document picker, settings): `bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-xl` (or `shadow-2xl` on modals). `rounded-2xl` (16px) is the floating-island corner — anything larger feels balloon-y, anything smaller feels rectangular.
- **Inline Feature Card** (landing features, philosophy callouts): `rounded-2xl border border-stone-800 bg-stone-900/50 p-6` (dark) — note the **absence of shadow**. Inline cards lift via background-tone, not elevation.
- **Internal padding:** Default to `p-6` (24px). Tighter (`p-4` / 16px) for dense list rows; never `p-8`+ on a card unless the content is itself centered display type.

### Inputs / Fields
**Character:** Almost no chrome. Inputs are a one-pixel rule that the focus ring brings to life.

- **Style:** `bg-transparent border-b border-violet-300 dark:border-violet-700 text-stone-800 dark:text-stone-100 font-serif text-base py-1` — no top/right/left border, no rounded corners, no background. The serif on the input is intentional: the user is typing prose-adjacent content.
- **Focus:** Border shifts to `focus:border-violet-500`. The global `input:focus-visible` rule adds a 2px violet outline at 60% opacity, offset 1px.
- **Error / Disabled:** `disabled:opacity-50 disabled:cursor-wait`. Errors live in copy beneath the field, not as a red border.

### Block Container (signature component)
**Character:** The most important component in the app. A block is a row of prose plus its quiet chrome — type indicator, drag handle, history dot, sentiment badge. The chrome must disappear when not needed.

- **Shape:** 12px corner radius (`rounded-md`-ish), full column width — every block-type uses the same container. Identity comes from tint, marker, and pill, never from a different shape or width.
- **Chrome opacity:** `opacity: 0.25` at rest, transitioning to `opacity: 1` on `:hover` or `:focus-within` (150ms ease-out). Zen mode strips it entirely.
- **Block-type variants:**
  - `text`: bare. Default container, no tint, no marker.
  - `dialogue`: tinted background using the speaker's color (mixed in via `color-mix`). Unassigned speakers get `dialogue-teal` at 6-10% opacity. Side and top borders are forced transparent so the tint reads as the bubble itself.
  - `scene`: 2px Story Orange left border at 40% opacity (`border-left: 2px solid rgba(234, 88, 12, 0.4); padding-left: 14px`). See **The Functional-Marker Exception** below — this is the one allowed border-left in the system.
  - `note`: `color: stone-500` + `font-style: italic`. Dimmed prose so the eye skips past notes when reading the manuscript; not exported.
- **Drag-and-drop:** Source dims to 35% opacity. Hover target gets a 2px Writer Violet line above (`::before`) or below (`::after`) depending on which half the pointer sits in.

### Modals
**Character:** Modals are a last resort, but when used, they read as a discrete slab — not a floating popover.

- **Backdrop:** `fixed inset-0 bg-stone-900/40 backdrop-blur-sm` (or `/50` for confirm/feedback emphasis). Animated via `inkmirror-modal-backdrop` (140ms ease-out fade).
- **Panel:** `bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-xl` (or `shadow-2xl` on settings). Animated via `inkmirror-modal-panel` (180ms cubic-bezier scale-and-fade from 0.96 to 1.0). Exit animation is paired and runs before unmount.
- **Header:** Title in `font-serif text-lg`. Close button is a `w-7 h-7 rounded` icon button.
- **Z-index:** `z-40` for regular modals, `z-50` for confirm/feedback overlays.

### Navigation (Site / Editor)
**Character:** Quiet, top-aligned, no logo lockup competing with the prose.

- **Site nav** (landing/roadmap/privacy): inline links in `font-sans text-sm`, no underlines except `underline underline-offset-4` on the secondary CTA.
- **Sidebar** (editor): `bg-stone-100 dark:bg-stone-900` (which becomes Vellum / Indigo Lamplight via the CSS layer). Items have soft hover via `hover:bg-stone-200 dark:hover:bg-stone-700/30`.
- **Settings tabs**: `text-left px-3 py-2 rounded-lg`. Active state `bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 font-semibold`.

### Story Pulse ECG (signature component)
**Character:** The mirror made literal. A horizontal sentiment strip across the top of the editor that draws in left-to-right on first render.

- Renders as inline SVG bars colored by sentiment (warm → Story Orange, cool → Writer Violet via the heatmap palette).
- **Draw-in animation:** `mask-image: linear-gradient(to right, black 0%, black 100%)` with `mask-size` animating from `0% 100%` to `100% 100%` over 600ms ease-out.
- Hidden in zen mode.
- Respects `prefers-reduced-motion` (animation disabled, bars appear immediately).

### Mirror Breath (signature decoration)
**Character:** The one place the app is *intentionally* alive.

- The landing hero shows the word `InkMirror` and beneath it a reflection: same word, scaled `scaleY(-1)`, masked with a gradient fade-out, blurred 0.5px.
- The reflection animates `mirror-breath` (6s ease-in-out infinite) — `scaleY(-1) scale(1.0)` ⟷ `scaleY(-1) scale(1.01)`, opacity 0.5 ⟷ 0.42. Subliminal, not eye-catching.
- The class `.inkmirror-mirror-breath` applies `scaleY(-1)` — **only use it on reflections, never on readable text**.

## 6. Do's and Don'ts

### Do:
- **Do** route every neutral background through Vellum / Indigo Lamplight. The CSS layer in `src/index.css` already rewrites `bg-stone-100`, `bg-white`, `bg-stone-900`, `bg-stone-800` — trust that, don't bypass with hardcoded `#fff`.
- **Do** use `.inkmirror-smallcaps` for category labels and badge text. Real OpenType small-caps with letter-spacing 0.08em, weight 500. Never raw `text-transform: uppercase`.
- **Do** put `tabular-nums` on every counter (word count, reading time, character count, build identity footer). Old-style numerals (`onum`) only inside `[data-editable]`.
- **Do** use Writer Violet for focus, selection, drag-targets, primary CTAs, search-match. Use Story Orange for scene markers and the heatmap warm pole. That is the entire authorized palette outside neutrals.
- **Do** pair `@keyframes` with a `prefers-reduced-motion: reduce` `animation: none !important` override. Every single one. No exceptions.
- **Do** use `rounded-2xl` (16px) for floating-island surfaces (modals, document picker, feature cards), `rounded-md`/`rounded-lg` (8-12px) for inline buttons and inputs.
- **Do** lead with a ghost button (border + stone text → violet hover) for any non-primary action. Reserve the violet-fill primary for the one decisive CTA per surface.
- **Do** start every motion at 140-180ms and let it ease out exponentially (`cubic-bezier(0.2, 0.9, 0.3, 1)` and friends). Mirror-breath at 6s is the only long-duration exception.

### Don't:
- **Don't** use indigo-to-purple gradients, hero-metric cards, glassmorphism, "Built with [logo] [logo]" trust strips, or any other AI-startup-landing-page cliché. InkMirror's anti-references include Linear/Vercel-style aesthetics by name.
- **Don't** add "Continue writing", "Generate", "Improve", or any other generative-AI button into the editor surface. The AI reads, never writes. Every Sudowrite/Novelcrafter pattern is forbidden.
- **Don't** introduce a third hot color. Red for danger, green for success, blue for info — use stone neutrals plus an icon or copy first. Adding hot colors dilutes the violet/orange metaphor.
- **Don't** use side-stripe `border-left`/`border-right` greater than 1px as a colored card accent. **The one exception:** scene blocks get a 2px Story Orange left border because they are a block-taxonomy marker, not a card accent — see The Functional-Marker Exception. Do not extend the pattern to other components.
- **Don't** use gradient text (`background-clip: text` + gradient bg). Decorative, never meaningful. Use weight or size for emphasis.
- **Don't** use glassmorphism as decoration. Backdrop blur is allowed only as a modal scrim (`backdrop-blur-sm` on `inkmirror-modal-backdrop`); never on inline cards or popovers.
- **Don't** put `--elev-2` or deeper on an inline card to "make it pop." If a surface doesn't float, it doesn't get a shadow — use border + background tone.
- **Don't** hardcode English in JSX. Every user-facing string routes through `t()` from `src/i18n`. The compiler doesn't catch hardcoded strings, but the app will ship a half-translated UI in Magyar.
- **Don't** apply `.inkmirror-mirror-breath` to readable text. The class includes `scaleY(-1)`. Reflections only.
- **Don't** open modals as a first thought. Inline editing, popovers, slide-in panels first; modal only when the action genuinely takes the full focus.
- **Don't** nest cards. A card inside a card is always wrong in this system.

### The Functional-Marker Exception

Scene blocks have a `border-left: 2px solid rgba(234, 88, 12, 0.4)` (Story Orange at 40%). This sits close to the absolute-ban "side-stripe accent" pattern, but is **deliberately exempt** because:

1. It is a block-taxonomy marker, not a card-accent decoration. Scene is one of four block types (`text`, `dialogue`, `scene`, `note`) and needs a visual distinction at the column edge so the eye scans pacing without reading.
2. It uses Story Orange, the second hot color, at the surface that owns scene-ness (a scene is `location + time + characters + mood`, the "story" side of the two-hearts metaphor).
3. It is 2px and 40% opacity, quiet enough to scan past, present enough to mark.

**Do not extend this pattern to other components.** Cards, callouts, alerts, list items still observe the side-stripe ban. The Functional-Marker Exception applies to scene blocks only.

### The Danger-Red Carve-out

Delete and destroy affordances may use Tailwind `red-500` / `red-400` for hover state, error inputs may use `red-400` for the focus border, and toast errors may use `red-3xx` / `red-7xx` for the border + text. This sits outside the Two Hot Colors Rule but is **deliberately exempt** because:

1. Red is the universal danger language. Substituting violet or stone for "delete" would actively mislead.
2. Danger-red is always paired with copy ("Delete", "×", confirm dialog) and never carries meaning alone, so it does not extend the brand palette by accident.
3. It appears only in destructive interaction states, never in resting chrome. A surface that is red while idle is wrong; a surface that turns red on hover before a destructive action is correct.

**Do not extend this carve-out to non-destructive states.** No red on info, validation, status, or branding. If a feature needs to "warn without destroying," use a stone-toned background with an icon and copy, not red.
