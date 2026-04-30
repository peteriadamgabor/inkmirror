import { createMemo, For } from 'solid-js';
import { t } from '@/i18n';

/**
 * Curated brand-safe palette for character colors. Each is tuned to be
 * legible against both vellum (light) and stone-800 (dark) backgrounds
 * for the dialogue tint and speaker pill. The first two echo the
 * Two-Heart Mirror tokens (writer = violet, story = orange) so a
 * one-protagonist book feels native; the rest spread across hue space
 * without colliding with each other on the arcs chart.
 *
 * If you change this list, also re-evaluate `DEFAULT_CHARACTER_COLORS`
 * in `src/store/document-characters.ts` — keeping the auto-assignment
 * cycle drawn from this palette so newly created characters land on
 * recognisable shades.
 */
export const CURATED_CHARACTER_PALETTE: ReadonlyArray<string> = [
  '#7F77DD', // violet (writer)
  '#D85A30', // orange (story)
  '#1D9E75', // teal
  '#378ADD', // blue
  '#D4537E', // pink
  '#639922', // green
  '#B7892C', // amber
  '#8358D0', // purple
  '#4A8AB0', // slate-blue
  '#C24A4A', // red
  '#44A37A', // emerald
  '#9A6F3F', // tan / earth
];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** Normalise to lowercase #rrggbb or null if not a 6-digit hex. */
function normaliseHex(value: string): string | null {
  const trimmed = value.trim();
  const m = HEX_RE.exec(trimmed);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Optional descriptive label rendered as a small eyebrow above the swatches. */
  label?: string;
  /** Optional hint paragraph rendered between the label and the swatches. */
  hint?: string;
}

export function ColorPicker(props: Props) {
  const currentNormalised = createMemo(() => normaliseHex(props.value));

  const apply = (raw: string): void => {
    const next = normaliseHex(raw);
    if (next && next !== currentNormalised()) props.onChange(next);
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
          {props.label ?? t('colorPicker.label')}
        </span>
        <span
          class="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums uppercase"
          aria-label={t('colorPicker.currentLabel')}
        >
          {currentNormalised() ?? props.value}
        </span>
      </div>

      <div role="radiogroup" aria-label={t('colorPicker.label')} class="flex flex-wrap gap-2">
        <For each={CURATED_CHARACTER_PALETTE}>
          {(swatch) => {
            const isSelected = () => currentNormalised() === swatch.toLowerCase();
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected()}
                aria-label={swatch}
                onClick={() => apply(swatch)}
                class="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-400 ring-offset-white dark:ring-offset-stone-800"
                classList={{
                  'ring-2 ring-stone-900 dark:ring-stone-100': isSelected(),
                }}
                style={{ 'background-color': swatch }}
              />
            );
          }}
        </For>

        {/* Native color input: lets the user free-form pick anything not in
            the curated palette. The wrapper styling makes it look like a
            ringed swatch so it sits naturally next to the curated row. */}
        <label
          class="relative w-7 h-7 rounded-full overflow-hidden border border-dashed border-stone-300 dark:border-stone-600 hover:border-violet-400 transition-colors cursor-pointer flex items-center justify-center"
          aria-label={t('colorPicker.customLabel')}
          title={t('colorPicker.customLabel')}
        >
          <span
            class="block w-3.5 h-3.5 rounded-sm"
            style={{
              background:
                'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)',
            }}
          />
          <input
            type="color"
            value={currentNormalised() ?? '#7F77DD'}
            onChange={(e) => apply(e.currentTarget.value)}
            onInput={(e) => apply(e.currentTarget.value)}
            class="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>

      {props.hint && (
        <p class="text-[11px] text-stone-400 dark:text-stone-500 leading-snug">
          {props.hint}
        </p>
      )}
    </div>
  );
}
