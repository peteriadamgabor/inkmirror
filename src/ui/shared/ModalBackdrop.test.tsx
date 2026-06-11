import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { ModalBackdrop } from './ModalBackdrop';

/** Lets the trap's deferred initial-focus setTimeout(0) fire. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ModalBackdrop focus trap', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('Tab on the last focusable wraps to the first', async () => {
    const r = render(() => (
      <ModalBackdrop>
        <div>
          <button type="button" data-testid="first">
            A
          </button>
          <button type="button" data-testid="last">
            B
          </button>
        </div>
      </ModalBackdrop>
    ));
    await tick();
    const first = r.getByTestId('first');
    const last = r.getByTestId('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab on the first focusable wraps to the last', async () => {
    const r = render(() => (
      <ModalBackdrop>
        <div>
          <button type="button" data-testid="first">
            A
          </button>
          <button type="button" data-testid="last">
            B
          </button>
        </div>
      </ModalBackdrop>
    ));
    await tick();
    const first = r.getByTestId('first');
    const last = r.getByTestId('last');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Tab in between elements is left to the browser', async () => {
    const r = render(() => (
      <ModalBackdrop>
        <div>
          <button type="button" data-testid="first">
            A
          </button>
          <button type="button" data-testid="mid">
            B
          </button>
          <button type="button" data-testid="last">
            C
          </button>
        </div>
      </ModalBackdrop>
    ));
    await tick();
    const first = r.getByTestId('first');
    first.focus();
    // dispatchEvent returns false when preventDefault() was called.
    const notCancelled = fireEvent.keyDown(first, { key: 'Tab' });
    expect(notCancelled).toBe(true);
    // Focus is unchanged here only because jsdom has no native Tab
    // navigation; the assertion above is the real check.
    expect(document.activeElement).toBe(first);
  });

  it('Tab with no focusable content is swallowed', async () => {
    const r = render(() => (
      <ModalBackdrop>
        <div data-testid="panel">just text</div>
      </ModalBackdrop>
    ));
    await tick();
    const panel = r.getByTestId('panel');
    const notCancelled = fireEvent.keyDown(panel, { key: 'Tab' });
    expect(notCancelled).toBe(false);
  });

  it('restores focus to the previously focused element on unmount', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'opener';
    document.body.appendChild(outside);
    outside.focus();

    const [open, setOpen] = createSignal(true);
    const r = render(() => (
      <Show when={open()}>
        <ModalBackdrop>
          <div>
            <button type="button" data-testid="inside">
              inside
            </button>
          </div>
        </ModalBackdrop>
      </Show>
    ));
    await tick();
    // Initial-focus fallback pulled focus inside the modal.
    expect(document.activeElement).toBe(r.getByTestId('inside'));

    setOpen(false);
    expect(document.activeElement).toBe(outside);
  });

  it('does not restore focus to a disconnected element', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const [open, setOpen] = createSignal(true);
    render(() => (
      <Show when={open()}>
        <ModalBackdrop>
          <div>
            <button type="button">inside</button>
          </div>
        </ModalBackdrop>
      </Show>
    ));
    await tick();
    outside.remove();
    // Must not throw, and must not focus the detached node.
    setOpen(false);
    expect(document.activeElement).not.toBe(outside);
  });

  it('leaves initial focus alone when the consumer claims it', async () => {
    render(() => (
      <ModalBackdrop>
        <div>
          <button type="button">decoy</button>
          <input
            type="text"
            data-testid="own-focus"
            ref={(el) => queueMicrotask(() => el.focus())}
          />
        </div>
      </ModalBackdrop>
    ));
    await tick();
    expect((document.activeElement as HTMLElement | null)?.dataset.testid).toBe(
      'own-focus',
    );
  });
});
