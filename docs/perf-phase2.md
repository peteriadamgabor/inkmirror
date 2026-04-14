# Phase 2 Persistence — Performance Check

**Date:** 2026-04-14
**Commit:** `8938882` (after the IndexedDB pivot + idempotent upgrade fix)
**Measurement tool:** `scripts/measure-perf.mjs` — puppeteer-core headless Chromium against `npm run preview`

## Scroll FPS (500-block synthetic doc on /perf)

| Metric | Phase 1 final | Phase 2 | Verdict |
|---|---|---|---|
| Median FPS | 60 | 60 | unchanged |
| Mean frame time | 16.67 ms | 16.67 ms | unchanged |
| p95 frame time | 16.70 ms | 16.70 ms | unchanged |
| Dropped frames | 0 | 0 | unchanged |

## Input latency (keystroke → next paint on /perf-style harness)

| Metric | Phase 1 final | Phase 2 |
|---|---|---|
| Median | 16.7 ms | 16.7 ms |
| Mean | 16.67 ms | 16.67 ms |
| p95 | 16.8 ms | 16.8 ms |

1 frame at 60 Hz = 16.67 ms. We are vsync-floored on both metrics, which is the theoretical best-case for a rAF-driven measurement. The script reports `passedTarget: false` because its threshold is set strictly below 16.7 ms — this is the same cosmetic quirk as Phase 1, not a regression.

## Memory

| Metric | Phase 1 final | Phase 2 |
|---|---|---|
| Heap used | ~8 MB | 7.72 MB |
| Heap total | ~18 MB | 18 MB |

## Bundle

| Build | Phase 1 final | Phase 2 (SurrealDB attempt) | Phase 2 (IDB pivot, final) |
|---|---|---|---|
| JS | 65 KB gzipped | 68 KB gzipped + 12 MB wasm | **33 KB gzipped** |
| CSS | 2.84 KB gzipped | 2.84 KB gzipped | 2.84 KB gzipped |

The IDB pivot dropped total shipped bytes by **100×** (12 MB → 92 KB uncompressed) vs. the aborted SurrealDB Wasm attempt, and JS is actually smaller than Phase 1 — Vite's tree-shaking and the lack of any persistence machinery on the critical path means the write-through + soft-delete work adds effectively nothing to the bundle.

## Verdict

**PASS.** Phase 2 persistence adds zero measurable regression to scroll or input latency. Debounced write-through (500 ms per block) does exactly what it was designed to: keep the main thread idle during typing bursts and flush in the gaps.

## Notes

- IndexedDB write latency was not measured in this pass — writes happen in the 500 ms debounce window, completely outside the input-latency sample. If a future regression shows up in typing feel, `performance.mark` around the `saveBlock` call is the place to look.
- Bundle is small enough now that a cold load is essentially just the HTML + Solid runtime. Boot should feel instant in Firefox.
