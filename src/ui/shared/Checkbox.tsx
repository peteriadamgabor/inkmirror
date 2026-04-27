import type { JSX } from 'solid-js';
import { IconCheck } from './icons';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Optional content rendered to the right of the box. */
  label?: JSX.Element;
  ariaLabel?: string;
  class?: string;
}

/**
 * Themed replacement for `<input type="checkbox">`. The native input is
 * kept for accessibility (screen readers, keyboard tab focus) but visually
 * hidden via `sr-only`; a styled box mirrors its checked state with the
 * app's violet/stone palette.
 */
export function Checkbox(props: Props) {
  return (
    <label
      class={`inline-flex items-start gap-2 select-none ${props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${props.class ?? ''}`}
    >
      <span class="relative inline-flex shrink-0 items-center justify-center mt-0.5">
        <input
          type="checkbox"
          class="peer sr-only"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
          aria-label={props.ariaLabel}
        />
        <span
          aria-hidden="true"
          class="w-[18px] h-[18px] rounded-md border-2 border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 transition-colors flex items-center justify-center peer-hover:border-violet-400 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/40 peer-focus-visible:border-violet-500 peer-checked:bg-violet-500 peer-checked:border-violet-500 peer-disabled:peer-hover:border-stone-300 dark:peer-disabled:peer-hover:border-stone-600"
        >
          <span
            class="text-white transition-opacity"
            style={{ opacity: props.checked ? 1 : 0 }}
          >
            <IconCheck size={12} />
          </span>
        </span>
      </span>
      {props.label}
    </label>
  );
}
