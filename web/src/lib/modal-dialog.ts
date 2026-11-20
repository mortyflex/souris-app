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
 *   * a swipe or a wheel turn that has nothing to scroll inside it never
 *     scrolls the page behind it either: only a scroll area of the dialog (a
 *     long description) moves under a finger — the page stays where it was,
 *     without the root's own scrolling ever being switched off on a touch
 *     screen (globals.css explains why);
 *   * the same for a hardware keyboard (an iPad's): an arrow, Page Up / Down,
 *     Home, End or Space scrolls the dialog's own scroll area while it can
 *     move that way, and never the page behind. A field keeps its keys, a
 *     button its Space; Tab, Shift + Tab, Enter and Escape are never touched;
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
  /** Present on the gestures (`touchmove`, `wheel`) and the keys: what stops the page behind from scrolling. */
  preventDefault?(): void;
  /** A `keydown`: the key and its modifier; whether something else already handled it. */
  readonly key?: string;
  readonly shiftKey?: boolean;
  readonly defaultPrevented?: boolean;
}

export type DialogEventType = "close" | "click" | "pointerdown" | "touchmove" | "wheel" | "keydown";

export interface ModalDialogLike {
  readonly open: boolean;
  showModal(): void;
  close(): void;
  addEventListener(type: DialogEventType, listener: (event: DialogEventLike) => void, options?: { passive?: boolean }): void;
  removeEventListener(type: DialogEventType, listener: (event: DialogEventLike) => void): void;
}

export interface FocusableLike {
  focus(options?: { preventScroll?: boolean }): void;
}

/** An element a gesture or a key may start on — enough of it to walk up to the dialog. */
export interface GestureTargetLike {
  readonly parentElement?: GestureTargetLike | null;
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

/** Whether an element is a scroll area that has something to scroll right now. */
export type ScrollableTest = (element: GestureTargetLike) => boolean;

/** Where a key scrolls. */
export type ScrollDirection = "up" | "down" | "left" | "right";

/** Whether an element is a scroll area that can still move that way. */
export type ScrollTowardsTest = (element: GestureTargetLike, direction: ScrollDirection) => boolean;

export interface PresentModalDialogOptions {
  readonly initialFocus?: FocusableLike | null;
  readonly returnFocus?: FocusableLike | null;
  readonly onClosed: () => void;
  /** Tests only: the browser's own reading of an element (overflow, sizes) is the default. */
  readonly isScrollable?: ScrollableTest;
  /** Tests only: the browser's own reading of an element (overflow, sizes, position) is the default. */
  readonly canScrollTowards?: ScrollTowardsTest;
}

/** The browser's reading: a vertical scroll area (`overflow-y: auto | scroll`) taller inside than outside. */
export function isScrollableElement(element: GestureTargetLike): boolean {
  if (typeof Element === "undefined" || typeof getComputedStyle !== "function" || !(element instanceof Element)) return false;
  const { overflowY } = getComputedStyle(element);
  return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1;
}

/** The browser's reading: a scroll area of that axis that has not reached its end on that side. */
export function canElementScrollTowards(element: GestureTargetLike, direction: ScrollDirection): boolean {
  if (typeof Element === "undefined" || typeof getComputedStyle !== "function" || !(element instanceof Element)) return false;
  const style = getComputedStyle(element);
  const vertical = direction === "up" || direction === "down";
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  if (vertical) return direction === "down" ? element.scrollTop < element.scrollHeight - element.clientHeight - 1 : element.scrollTop > 0;
  return direction === "right" ? element.scrollLeft < element.scrollWidth - element.clientWidth - 1 : element.scrollLeft > 0;
}

/** The keys a browser scrolls a page with, and the way each goes — Space down, Shift + Space up. */
export function scrollDirectionOfKey(event: { readonly key?: string; readonly shiftKey?: boolean }): ScrollDirection | undefined {
  switch (event.key) {
    case "ArrowDown":
    case "PageDown":
    case "End":
      return "down";
    case "ArrowUp":
    case "PageUp":
    case "Home":
      return "up";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case " ":
    case "Spacebar":
      return event.shiftKey ? "up" : "down";
    default:
      return undefined;
  }
}

/** A control that answers the key itself: a field (its caret, its value) — and, for Space, a button (it activates). */
export function controlKeepsKey(target: unknown, key: string): boolean {
  const element = target as GestureTargetLike | null;
  if (element === null || typeof element !== "object" || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toUpperCase();
  if (element.isContentEditable === true || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const space = key === " " || key === "Spacebar";
  return space && (tag === "BUTTON" || tag === "SUMMARY" || element.getAttribute?.("role") === "button");
}

/** Whether a key pressed on `target` scrolls a scroll area of the dialog that can still move that way. */
export function scrollsInsideDialogTowards(
  target: unknown,
  dialog: unknown,
  direction: ScrollDirection,
  canScrollTowards: ScrollTowardsTest = canElementScrollTowards,
): boolean {
  let node = (target ?? null) as GestureTargetLike | null;
  while (node !== null && node !== dialog) {
    if (canScrollTowards(node, direction)) return true;
    node = node.parentElement ?? null;
  }
  return false;
}

/**
 * Whether a gesture that starts on `target` has something to scroll INSIDE the
 * dialog: a scroll area between the target and the dialog. The dialog itself
 * (its backdrop) never counts.
 */
export function scrollsInsideDialog(target: unknown, dialog: unknown, isScrollable: ScrollableTest = isScrollableElement): boolean {
  let node = (target ?? null) as GestureTargetLike | null;
  while (node !== null && node !== dialog) {
    if (isScrollable(node)) return true;
    node = node.parentElement ?? null;
  }
  return false;
}

export function presentModalDialog(dialog: ModalDialogLike, options: PresentModalDialogOptions): () => void {
  let pressedOnBackdrop = false;
  let active = true;
  const isScrollable = options.isScrollable ?? isScrollableElement;
  const canScrollTowards = options.canScrollTowards ?? canElementScrollTowards;

  const onPointerDown = (event: DialogEventLike) => {
    pressedOnBackdrop = event.target === dialog;
  };
  const onClick = (event: DialogEventLike) => {
    const fromBackdrop = pressedOnBackdrop && event.target === dialog;
    pressedOnBackdrop = false;
    if (fromBackdrop && dialog.open) dialog.close();
  };
  // A swipe on the backdrop, the header or a row would otherwise scroll the page behind the dialog
  // (scroll chaining): only a scroll area of the dialog may take it.
  const onScrollGesture = (event: DialogEventLike) => {
    if (!scrollsInsideDialog(event.target, dialog, isScrollable)) event.preventDefault?.();
  };
  // A hardware keyboard: what would scroll the page behind scrolls only the dialog's own scroll area, while
  // it can still move that way — nothing at all otherwise. Never a field's keys, never a button's Space.
  const onKeyDown = (event: DialogEventLike) => {
    if (event.defaultPrevented === true) return;
    const direction = scrollDirectionOfKey(event);
    if (direction === undefined || controlKeepsKey(event.target, event.key ?? "")) return;
    if (!scrollsInsideDialogTowards(event.target, dialog, direction, canScrollTowards)) event.preventDefault?.();
  };
  const onClose = () => {
    if (!active || dialog.open) return;
    active = false;
    options.returnFocus?.focus({ preventScroll: true });
    options.onClosed();
  };

  dialog.addEventListener("pointerdown", onPointerDown);
  dialog.addEventListener("click", onClick);
  // Not passive: a passive listener cannot stop a swipe.
  dialog.addEventListener("touchmove", onScrollGesture, { passive: false });
  dialog.addEventListener("wheel", onScrollGesture, { passive: false });
  dialog.addEventListener("keydown", onKeyDown);
  dialog.addEventListener("close", onClose);
  if (!dialog.open) dialog.showModal();
  options.initialFocus?.focus({ preventScroll: true });

  return () => {
    dialog.removeEventListener("pointerdown", onPointerDown);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("touchmove", onScrollGesture);
    dialog.removeEventListener("wheel", onScrollGesture);
    dialog.removeEventListener("keydown", onKeyDown);
    dialog.removeEventListener("close", onClose);
    if (active && dialog.open) {
      active = false;
      dialog.close();
      options.returnFocus?.focus({ preventScroll: true });
    }
  };
}
