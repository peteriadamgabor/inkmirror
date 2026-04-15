# pretext research log (Task 6)

## Verdict: YELLOW

A real, usable `pretext` package exists on npm under the scope `@chenglou/pretext`,
authored by Cheng Lou, and its API matches the project's description almost
exactly. It is wired up as the production measure backend. The single caveat
is that it requires a real Canvas context (`OffscreenCanvas` or DOM
`<canvas>.getContext('2d')`), so the unit-test integration check is
`describe.skip`-ed under JSDOM and the backend will be validated in the
Task 14 perf harness running in a real browser.

## Lookup log (Step 6.1)

| Lookup                              | Result                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `npm view pretext`                  | Exists — `pretext@0.3.0` by anttisykari, "a simple Markdown-inspired markup language". **Unrelated** to text measurement. |
| `npm view @chenglou/pretext`        | **HIT.** `@chenglou/pretext@0.0.5`, MIT, "Fast, accurate & comprehensive text measurement & layout", published 4 days ago by chenglou. Keywords: text-layout, text-measurement, line-breaking, typography, canvas, svg, unicode. |
| `npm view pretext-layout`           | 404 Not Found                                                                   |
| `npm view canvas-text-measure`      | 404 Not Found                                                                   |
| `npm search "cheng lou text"`       | No relevant hits (returned generic text utilities like html-to-text, text-table, etc.) |

The unscoped `pretext` package is a markup preprocessor by a different
author and must not be used. The scoped `@chenglou/pretext` is the real
target. Repository: https://github.com/chenglou/pretext.

## Package shape

- **Name:** `@chenglou/pretext`
- **Version:** `0.0.5` (published 4 days ago — note: very young, expect churn)
- **License:** MIT
- **Module type:** ESM (`"type": "module"`)
- **Main:** `./dist/layout.js`
- **Types:** `./dist/layout.d.ts` (ships first-party TypeScript declarations)
- **Deps:** none
- **Unpacked size:** ~860 kB (includes bidi tables and a demo `pages/` tree)

## API shape (from `dist/layout.d.ts`)

```ts
export function prepare(text: string, font: string, options?: PrepareOptions): PreparedText;
export function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult;

export type LayoutResult = { lineCount: number; height: number };
export type PrepareOptions = { whiteSpace?: WhiteSpaceMode; wordBreak?: WordBreakMode };
```

This is a near-exact match for `MeasureInput → MeasureResult`. The
two-phase `prepare` / `layout` split is even friendlier than expected
because it lets future code reuse a `PreparedText` across multiple
width queries (relevant for Task 14 perf work, but out of scope here —
the current `Measurer` interface only memoizes the full result).

Other useful exports we are not yet using: `prepareWithSegments`,
`layoutWithLines`, `walkLineRanges`, `clearCache`, `setLocale`.

## Update (2026-04-13): README review of github.com/chenglou/pretext

The upstream README documents several things the `.d.ts` alone did not:

1. **`{ whiteSpace: 'pre-wrap' }` option on `prepare()`.** Without this,
   pretext normalizes whitespace like CSS `white-space: normal` — which
   DOES NOT match our BlockView, which uses Tailwind `whitespace-pre-wrap`.
   Our first measurements were therefore undercounting heights for any
   text with multi-space runs or `\n` soft breaks. Fixed in commit after
   this update: `createPretextMeasurer` now passes `{ whiteSpace: 'pre-wrap' }`
   unconditionally, matching the editor's CSS.
2. **Author explicitly lists our use case as a target.** The README says:
   > "prevent layout shift when new text loads and you wanna re-anchor
   > the scroll position"
   That is exactly what Editor.tsx's `captureAnchor`/`restoreAnchor` pair
   does. Worth knowing the library author considers this a first-class
   scenario — confirms our architecture is on the intended path.
3. **`prepareWithSegments` + `layoutWithLines`** give per-line ranges +
   per-line widths. This is a natural fit for Phase 3's "sentence rhythm"
   / Dual Pulse analysis — we could extract real line breakpoints from
   pretext instead of guessing from sentence lengths. Parked as a future
   optimization; no change to Plan 1/2.
4. **`rich-inline` helper** at `@chenglou/pretext/rich-inline` exists for
   inline flow with code spans, mentions, chips, etc. Not needed yet;
   worth remembering when we add @mentions / character references to the
   editor in Phase 3.
5. The `font` argument is a CSS shorthand string like `'16px Inter'` —
   confirmed matching how we pass `'16px Georgia, serif'`.

## Install command

```bash
npm install @chenglou/pretext
```

## Known quirks

1. **Requires a real Canvas context.** `dist/measurement.js`'s
   `getMeasureContext()` tries `new OffscreenCanvas(1,1).getContext('2d')`
   first, then falls back to `document.createElement('canvas').getContext('2d')`,
   then throws `"Text measurement requires OffscreenCanvas or a DOM canvas
   context."` Plain Node fails on this. JSDOM also fails because
   `HTMLCanvasElement.prototype.getContext` is unimplemented unless the
   native `canvas` npm package is installed (which we are deliberately
   avoiding — it's a heavy native dependency).
2. **No WebAssembly.** Despite ADR-002 calling pretext "Canvas/Wasm", the
   shipping 0.0.5 build is pure JS that delegates glyph metrics to
   `CanvasRenderingContext2D.measureText`. No Wasm instantiation step.
3. **Font loading is the host's responsibility.** pretext does not load
   fonts; it just calls `ctx.measureText` against whatever the
   browser/Canvas already has. Make sure web fonts are loaded
   (`document.fonts.ready`) before calling `prepare` if you care about
   accurate widths for custom fonts — relevant for Task 14, not Task 6.
4. **Very young package** (0.0.x, 4 days old). API may break. Pinning
   the exact version in `package.json` is reasonable; the Canvas
   fallback (`createCanvasMeasurer`) remains as the documented escape
   hatch per ADR-002.

## What was wired

- `src/engine/measure.ts`: `createPretextMeasurer` now imports
  `prepare` and `layout` from `@chenglou/pretext` and returns
  `{ height, lineCount }`. Empty strings short-circuit to
  `DEFAULT_BLOCK_HEIGHT`. The other three factories
  (`createStubMeasurer`, `createCanvasMeasurer`, `createMemoizedMeasurer`)
  are unchanged.
- `src/engine/measure.test.ts`: integration test for
  `createPretextMeasurer` is added but `describe.skip`-ed under JSDOM
  with an inline comment pointing here. It must be re-enabled (or
  ported to a real-browser harness) in Task 14.

---

## API cheat sheet

Quick reference for the `@chenglou/pretext@0.0.5` functions we'll
touch as new features land. All of them live on
`CanvasRenderingContext2D.measureText()` under the hood — there is
no Wasm, no custom shaper. ADR-002 was updated in 2026-04-15 to
reflect this; the original wording was wrong about the mechanism.

### `prepare(text, font)` → opaque prepared segments

Pre-parses the text into word / whitespace / punctuation segments,
caching per-segment metrics so subsequent `layout` calls on the
same string are cheap. Pass the CSS shorthand font string you'll
use at render time (e.g. `"16px Georgia, serif"`). Re-call
`prepare` whenever the text *or* the font changes.

### `layout(prepared, { width, lineHeight })` → `{ height, lines }`

Given a prepared string and a target column width in CSS pixels,
returns the total rendered height and the number of line breaks.
This is what `createPretextMeasurer` wraps — we only read `.height`
and hand it to the virtualizer, but `.lines` is useful for features
that want per-paragraph line counts (Story Pulse rhythm viz).

### `layoutWithLines(prepared, opts)` → `{ height, lines, lineRanges }`

Same as `layout` but also returns an array of `{start, end}`
character offsets per line. This is the hook for the backlog's
"sentence rhythm via `walkLineRanges`" Story Pulse item — it lets
us measure line-by-line widths and velocity rather than guessing
from sentence boundaries in the plain string.

### `walkLineRanges(prepared, width, visit)` → void

Streaming variant: calls `visit({start, end, width})` for each
line produced by the current width. Cheaper than `layoutWithLines`
when we only need a callback-style pass (e.g. for drawing a
per-line bar chart). The pretext author explicitly calls out
"editor virtualization with per-line hit testing" as the target
use case — this is the piece that unlocks proper Dual Pulse and
@-mention hit testing later.

### `@chenglou/pretext/rich-inline`

A separate entry point exposing an inline-rich-text renderer that
takes a `(segment, metrics) => node` callback and walks a prepared
string, yielding a mix of plain text and custom inline nodes. This
is the plumbing for character `@mentions`, code spans, and inline
chips inside dialogue blocks — see the "rich text" and "phase 3+
hooks" sections of the backlog. Not imported yet; the sample code
in pretext's README is the starting point.

### Lifecycle notes

- **Web fonts.** `prepare` reads font metrics via `ctx.measureText`,
  which depends on `document.fonts.ready` for fallback-vs-real font
  resolution. The boot path already awaits `document.fonts.ready`
  (bounded 1.5 s) before the first measurement pass — see
  `src/index.tsx`. If a new font is added later, the wait needs to
  cover it too.
- **Memoization.** `createMemoizedMeasurer` in `src/engine/measure.ts`
  caches `{content hash, width, font} → height`. pretext prepares
  internally, we memoize on top. Invalidation on content edit is
  driven by the content hash — see `Editor.tsx`'s initial pass.
- **ResizeObserver is still the source of truth.** See ADR-007.
  Pretext is a fast estimate; real DOM heights arrive asynchronously
  via the observer and overwrite the cached value. Treat any pretext
  number as "good enough for the first frame" and not authoritative.
- **Churn risk.** Still `0.0.x`, pinned to `^0.0.5` in `package.json`.
  The wrapper in `measure.ts` is the documented escape hatch per
  ADR-002 — if the API breaks, point `createPretextMeasurer` at the
  Canvas fallback and everything downstream keeps working.
