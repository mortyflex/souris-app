/**
 * A modal `<dialog>`, presented by the browser itself (`showModal()`): the page
 * behind it becomes inert — not clickable, not focusable, hidden from assistive
 * technologies — it sits in the top layer above every sticky bar, and Escape
 * closes it (`cancel`, then `close`). What the element leaves to its page is
 * done here, once:
 *
 *   * the first focus goes to the control given (`initialFocus`), so it never
 *     depends on how a browser picks it;
 *   * a press on the backdrop closes it — only a press that STARTED on the
 *     backdrop, so a text selection dragged out of the panel never does;
 *   * once closed, the focus goes back to the control that opened it
 *     (`returnFocus`), without scrolling the page, then `onClosed`.
 *
 * Returns the function that undoes it all; a dialog still open then (removed
 * while shown) is closed and the focus returned. A `close` event that arrives
 * once the dialog is open again — React's development double mount closes and
 * reopens it — belongs to the previous showing and is ignored.
 *
 * Plain TypeScript over the few members it uses: tested without a DOM.
 */

export interface DialogEventLike {
  readonly target: unknown;
}

export interface ModalDialogLike {
  readonly open: boolean;
  showModal(): void;
  close(): void;
  addEventListener(type: "close" | "click" | "pointerdown", listener: (event: DialogEventLike) => void): void;
  removeEventListener(type: "close" | "click" | "pointerdown", listener: (event: DialogEventLike) => void): void;
}

export interface FocusableLike {
  focus(options?: { preventScroll?: boolean }): void;
}

export interface PresentModalDialogOptions {
  readonly initialFocus?: FocusableLike | null;
  readonly returnFocus?: FocusableLike | null;
  readonly onClosed: () => void;
}

export function presentModalDialog(dialog: ModalDialogLike, options: PresentModalDialogOptions): () => void {
  let pressedOnBackdrop = false;
  let active = true;

  const onPointerDown = (event: DialogEventLike) => {
    pressedOnBackdrop = event.target === dialog;
  };
  const onClick = (event: DialogEventLike) => {
    const fromBackdrop = pressedOnBackdrop && event.target === dialog;
    pressedOnBackdrop = false;
    if (fromBackdrop && dialog.open) dialog.close();
  };
  const onClose = () => {
    if (!active || dialog.open) return;
    active = false;
    options.returnFocus?.focus({ preventScroll: true });
    options.onClosed();
  };

  dialog.addEventListener("pointerdown", onPointerDown);
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("close", onClose);
  if (!dialog.open) dialog.showModal();
  options.initialFocus?.focus({ preventScroll: true });

  return () => {
    dialog.removeEventListener("pointerdown", onPointerDown);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("close", onClose);
    if (active && dialog.open) {
      active = false;
      dialog.close();
      options.returnFocus?.focus({ preventScroll: true });
    }
  };
}
