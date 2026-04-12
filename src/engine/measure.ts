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
 * pretext-backed measurer. Real body wired in Task 6 after API research.
 */
export function createPretextMeasurer(): Measurer {
  return {
    measure() {
      throw new Error(
        'createPretextMeasurer not yet wired — see docs/pretext-research.md and Task 6',
      );
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
