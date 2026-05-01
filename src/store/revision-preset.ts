import { createSignal } from 'solid-js';

export const REVISION_PRESETS = ['frequent', 'balanced', 'sparse'] as const;
export type RevisionPreset = (typeof REVISION_PRESETS)[number];

const STORAGE_KEY = 'inkmirror.revisionPreset';
const DEFAULT_PRESET: RevisionPreset = 'balanced';

interface Gates {
  timeMs: number;
  distanceChars: number;
}

const GATES: Record<RevisionPreset, Gates> = {
  frequent: { timeMs: 30_000, distanceChars: 20 },
  balanced: { timeMs: 60_000, distanceChars: 30 },
  sparse: { timeMs: 120_000, distanceChars: 60 },
};

function readPreset(): RevisionPreset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (REVISION_PRESETS as readonly string[]).includes(raw)) {
      return raw as RevisionPreset;
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through
  }
  return DEFAULT_PRESET;
}

const [presetSignal, setPresetSignal] = createSignal<RevisionPreset>(
  readPreset(),
);

export function getRevisionPreset(): RevisionPreset {
  return readPreset();
}

export function setRevisionPreset(p: RevisionPreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    // ignore — signal still updates so the UI tracks intent for this session
  }
  setPresetSignal(p);
}

export function getActiveGates(): Gates {
  return GATES[readPreset()];
}

/** Solid accessor for reactive consumers (Settings UI). */
export const revisionPreset = presetSignal;
