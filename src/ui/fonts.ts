/**
 * Editor font stacks. System fonts only — no web-font downloads, so
 * the app stays offline-first and ships no extra bytes. Each stack
 * degrades gracefully: if the first choice isn't installed, browsers
 * walk the fallback list.
 */

export interface FontStack {
  id: string;
  label: string;
  description: string;
  stack: string;
}

export const FONT_STACKS: FontStack[] = [
  {
    id: 'literary',
    label: 'Literary',
    description: 'Warm editorial serif — the default',
    stack: 'Charter, "Iowan Old Style", "Sitka Text", Georgia, serif',
  },
  {
    id: 'classical',
    label: 'Classical',
    description: 'Palatino-style broad strokes',
    stack: '"Hoefler Text", "Palatino Linotype", "Book Antiqua", Palatino, serif',
  },
  {
    id: 'crisp',
    label: 'Crisp',
    description: 'Modern editorial — clean lines',
    stack: '"New York", Cambria, "Source Serif Pro", Georgia, serif',
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Contemporary reading surface',
    stack: 'Constantia, "Lucida Bright", "Bookerly", Georgia, serif',
  },
  {
    id: 'sans',
    label: 'Sans',
    description: 'Quiet sans-serif for minimal writers',
    stack: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    description: 'Typewriter-era monospace',
    stack: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
];

export const DEFAULT_STACK = FONT_STACKS[0];

/** Resolve a stored font_family string back to a known stack, if any. */
export function findStack(fontFamily: string | undefined): FontStack | null {
  if (!fontFamily) return null;
  return FONT_STACKS.find((s) => s.stack === fontFamily) ?? null;
}
