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
