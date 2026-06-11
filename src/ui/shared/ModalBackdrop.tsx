import { JSX, ParentComponent, onCleanup, onMount } from 'solid-js';

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
 * Everything the trap considers tabbable. Computed fresh on every Tab press —
 * modal content is dynamic (tabs, lazy panels, filtered lists).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Shared overlay for every modal in the app — full-viewport tinted backdrop
 * with `inkmirror-modal-backdrop` for the open/close animation, click-to-dismiss,
 * and a centered (or top-aligned) flex slot for the panel.
 *
 * The panel itself is the child; it should have `inkmirror-modal-panel` for the
 * paired animation and call `e.stopPropagation()` on its own click handler.
 *
 * Accessibility: the backdrop is also the focus trap for every modal.
 * - Tab / Shift+Tab cycle within the backdrop's subtree (wrapping at both ends).
 * - Focus returns to whatever was focused before the modal opened.
 * - If the consumer hasn't claimed focus itself shortly after mount (several
 *   modals focus their own input/panel via queueMicrotask or `autofocus`),
 *   the first focusable element inside is focused as a fallback.
 *
 * The Tab listener lives on the backdrop element — not document — so stacked
 * modals (e.g. ConfirmHost at z-50 over SettingsModal at z-40) each trap only
 * their own subtree.
 */
export const ModalBackdrop: ParentComponent<Props> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  // Captured once at mount, before any consumer steals focus into the modal.
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  onMount(() => {
    // Initial focus, deferred past the consumers' own queueMicrotask focus
    // calls (SettingsModal, CommandPalette, FeedbackHost, WhatsNewModal):
    // only move focus inside if it is still outside the modal by then.
    const timer = setTimeout(() => {
      const el = containerRef;
      if (!el) return;
      const active = document.activeElement;
      if (active && el.contains(active)) return;
      el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 0);
    onCleanup(() => clearTimeout(timer));
  });

  // Restore focus on unmount. Synchronous on purpose: CommandPalette closes
  // itself *before* running the chosen command, so a command that places
  // focus (e.g. block history) still wins over the restore.
  onCleanup(() => {
    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus();
    }
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !containerRef) return;
    const focusables = Array.from(
      containerRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) {
      // Nothing tabbable inside — keep focus where it is rather than letting
      // it escape behind the backdrop.
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    const idx = active instanceof HTMLElement ? focusables.indexOf(active) : -1;
    if (e.shiftKey) {
      // From the first element — or from a non-tabbable spot like a panel
      // with tabindex="-1" (where native Shift+Tab would escape) — wrap to
      // the last.
      if (idx <= 0) {
        e.preventDefault();
        focusables[focusables.length - 1].focus();
      }
    } else {
      // From the last element wrap to the first. If focus somehow sits
      // outside the modal, pull it back in.
      if (idx === focusables.length - 1 || (idx === -1 && !containerRef.contains(active))) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      class={`fixed inset-0 ${Z_CLASS[props.z ?? 40]} flex ${ALIGN_CLASS[props.align ?? 'center']} justify-center ${OPACITY_CLASS[props.opacity ?? 40]} backdrop-blur-sm inkmirror-modal-backdrop${props.class ? ' ' + props.class : ''}`}
      classList={{ 'inkmirror-modal-backdrop-exit': props.closing === true }}
      onClick={props.onClick}
      onKeyDown={onKeyDown}
    >
      {props.children}
    </div>
  );
};
