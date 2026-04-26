import { JSX, ParentComponent } from 'solid-js';

type Z = 40 | 50;
type Opacity = 40 | 50;
type Align = 'center' | 'start';

interface Props {
  /** Click handler — usually closes the modal. Stops propagation isn't needed; the panel handles that. */
  onClick?: (e: MouseEvent) => void;
  /** Stacking context. Confirm and Feedback overlay everything else (50); regular modals sit at 40. */
  z?: Z;
  /** Backdrop tint opacity. Confirm uses /50 for emphasis; everything else /40. */
  opacity?: Opacity;
  /** Where the panel sits vertically. CommandPalette uses 'start'; others 'center'. */
  align?: Align;
  /** Extra utility classes appended after the base — used by CommandPalette for `pt-[18vh]`. */
  class?: string;
  /** When true, swaps the open animation for the exit one (used by SettingsModal). */
  closing?: boolean;
  children: JSX.Element;
}

const Z_CLASS: Record<Z, string> = {
  40: 'z-40',
  50: 'z-50',
};

const OPACITY_CLASS: Record<Opacity, string> = {
  40: 'bg-stone-900/40',
  50: 'bg-stone-900/50',
};

const ALIGN_CLASS: Record<Align, string> = {
  center: 'items-center',
  start: 'items-start',
};

/**
 * Shared overlay for every modal in the app — full-viewport tinted backdrop
 * with `inkmirror-modal-backdrop` for the open/close animation, click-to-dismiss,
 * and a centered (or top-aligned) flex slot for the panel.
 *
 * The panel itself is the child; it should have `inkmirror-modal-panel` for the
 * paired animation and call `e.stopPropagation()` on its own click handler.
 */
export const ModalBackdrop: ParentComponent<Props> = (props) => (
  <div
    class={`fixed inset-0 ${Z_CLASS[props.z ?? 40]} flex ${ALIGN_CLASS[props.align ?? 'center']} justify-center ${OPACITY_CLASS[props.opacity ?? 40]} backdrop-blur-sm inkmirror-modal-backdrop${props.class ? ' ' + props.class : ''}`}
    classList={{ 'inkmirror-modal-backdrop-exit': props.closing === true }}
    onClick={props.onClick}
  >
    {props.children}
  </div>
);
