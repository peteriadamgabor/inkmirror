import { prepare, layout } from '@chenglou/pretext';

export interface MeasureInput {
  text: string;
  font: string;
  width: number;
  lineHeight: number;
}

export interface MeasureResult {
  height: number;
  lineCount: number;
}

export interface Measurer {
  measure(input: MeasureInput): MeasureResult;
}

/** Fallback height used when text is empty or a backend cannot measure. */
export const DEFAULT_BLOCK_HEIGHT = 32;

/**
 * Deterministic stub backend. Used in tests and as a temporary default
 * until createPretextMeasurer is wired up in Task 6. Not meant for prod.
 */
export function createStubMeasurer(): Measurer {
  return {
    measure({ text, lineHeight }) {
      if (text.length === 0) {
        return { height: DEFAULT_BLOCK_HEIGHT, lineCount: 1 };
      }
      const approxCharsPerLine = 80;
      const lines = Math.max(1, Math.ceil(text.length / approxCharsPerLine));
      return { height: Math.round(lines * 16 * lineHeight), lineCount: lines };
    },
  };
}

/**
 * Canvas fallback — NOT IMPLEMENTED in Plan 1. Declared so the Measurer
 * interface signals swap-ability if the pretext backend fails.
 */
export function createCanvasMeasurer(): Measurer {
  return {
    measure() {
      throw new Error('createCanvasMeasurer not implemented — see spec fallback plan');
    },
  };
}

/**
 * pretext-backed measurer.
 *
 * Backed by `@chenglou/pretext` (Canvas-based text measurement & layout).
 * The library requires `OffscreenCanvas` or a DOM `<canvas>` context at
 * measure time, so this only works in real browsers (Vite dev/prod) or in
 * a JSDOM environment that has the native `canvas` package installed.
 *
 * For empty text we short-circuit to DEFAULT_BLOCK_HEIGHT to (a) avoid
 * paying the prepare cost and (b) match createStubMeasurer's contract.
 *
 * See docs/pretext-research.md for the API research log and verdict.
 */
export function createPretextMeasurer(): Measurer {
  return {
    measure({ text, font, width, lineHeight }) {
      if (text.length === 0) {
        return { height: DEFAULT_BLOCK_HEIGHT, lineCount: 1 };
      }
      // BlockView renders with CSS `white-space: pre-wrap` (Tailwind
      // `whitespace-pre-wrap`), so pretext must be told to preserve
      // spaces, tabs, and \n hard breaks rather than collapsing them.
      // Without this option pretext under-counts lines for any text
      // containing multi-space runs or newlines.
      const prepared = prepare(text, font, { whiteSpace: 'pre-wrap' });
      const result = layout(prepared, width, lineHeight);
      return { height: result.height, lineCount: result.lineCount };
    },
  };
}

/** Wraps a Measurer with a keyed cache on (width, font, lineHeight, text). */
export function createMemoizedMeasurer(backend: Measurer): Measurer {
  const cache = new Map<string, MeasureResult>();
  return {
    measure(input) {
      const key = `${input.width}|${input.font}|${input.lineHeight}|${input.text}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const result = backend.measure(input);
      cache.set(key, result);
      return result;
    },
  };
}
