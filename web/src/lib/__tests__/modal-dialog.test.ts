import { describe, expect, it, vi } from "vitest";

import {
  canElementScrollTowards,
  controlKeepsKey,
  isScrollableElement,
  presentModalDialog,
  scrollDirectionOfKey,
  scrollsInsideDialog,
  scrollsInsideDialogTowards,
  type ScrollDirection,
  type DialogEventLike,
  type FocusableLike,
  type GestureTargetLike,
  type ModalDialogLike,
} from "../modal-dialog";

type Listener = (event: DialogEventLike) => void;

/** A stand-in `<dialog>`: `close()` queues its `close` event, as the browser does (a task, later). */
function fakeDialog() {
  const listeners = new Map<string, Set<Listener>>();
  const queued: Array<() => void> = [];
  const calls: string[] = [];
  const dialog: ModalDialogLike & {
    dispatch: (type: string, target?: unknown, extra?: Partial<DialogEventLike>) => void;
    flush: () => void;
    escape: () => void;
    calls: string[];
    listenerCount: () => number;
    optionsOf: Map<string, { passive?: boolean } | undefined>;
  } = {
    open: false,
    calls,
    showModal() {
      calls.push("showModal");
      (dialog as { open: boolean }).open = true;
    },
    close() {
      calls.push("close");
      if (!dialog.open) return;
      (dialog as { open: boolean }).open = false;
      queued.push(() => dialog.dispatch("close", dialog));
    },
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
      dialog.optionsOf.set(type, options);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, target = dialog, extra = {}) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ target, ...extra });
    },
    flush() {
      while (queued.length > 0) queued.shift()!();
    },
    // The browser's own Escape: `cancel`, then the dialog closes.
    escape() {
      dialog.close();
    },
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    optionsOf: new Map(),
  };
  return dialog;
}

const focusable = (name: string, log: string[]): FocusableLike => ({
  focus: (options) => log.push(`${name}${options?.preventScroll ? " (no scroll)" : ""}`),
});

describe("presentModalDialog — opening", () => {
  it("shows the dialog as a modal and puts the focus on the control given", () => {
    const dialog = fakeDialog();
    const focus: string[] = [];
    presentModalDialog(dialog, { initialFocus: focusable("close", focus), returnFocus: focusable("trigger", focus), onClosed: vi.fn() });
    expect(dialog.calls).toEqual(["showModal"]);
    expect(dialog.open).toBe(true);
    expect(focus).toEqual(["close (no scroll)"]);
  });

  it("never shows twice a dialog already open", () => {
    const dialog = fakeDialog();
    dialog.showModal();
    presentModalDialog(dialog, { onClosed: vi.fn() });
    expect(dialog.calls).toEqual(["showModal"]);
  });
});

describe("presentModalDialog — closing", () => {
  it("Escape: the focus goes back to the control that opened it, then onClosed — once", () => {
    const dialog = fakeDialog();
    const focus: string[] = [];
    const onClosed = vi.fn();
    presentModalDialog(dialog, { initialFocus: focusable("close", focus), returnFocus: focusable("trigger", focus), onClosed });
    dialog.escape();
    expect(onClosed).not.toHaveBeenCalled(); // the browser's close event comes later
    dialog.flush();
    expect(focus).toEqual(["close (no scroll)", "trigger (no scroll)"]);
    expect(onClosed).toHaveBeenCalledTimes(1);
    dialog.dispatch("close");
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("a press that starts AND ends on the backdrop closes it", () => {
    const dialog = fakeDialog();
    const onClosed = vi.fn();
    presentModalDialog(dialog, { onClosed });
    dialog.dispatch("pointerdown", dialog);
    dialog.dispatch("click", dialog);
    dialog.flush();
    expect(dialog.open).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("a press inside the panel, or a text selection dragged out of it, never closes it", () => {
    const dialog = fakeDialog();
    const onClosed = vi.fn();
    const panel = { name: "panel" };
    presentModalDialog(dialog, { onClosed });
    dialog.dispatch("pointerdown", panel);
    dialog.dispatch("click", panel);
    // Selecting text from the panel to the backdrop: the click lands on the dialog itself.
    dialog.dispatch("pointerdown", panel);
    dialog.dispatch("click", dialog);
    // A click with no press first (a keyboard activation elsewhere) never closes it either.
    dialog.dispatch("click", dialog);
    dialog.flush();
    expect(dialog.open).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("undoing it removes every listener; a dialog removed while open is closed and the focus returned", () => {
    const dialog = fakeDialog();
    const focus: string[] = [];
    const onClosed = vi.fn();
    const undo = presentModalDialog(dialog, { returnFocus: focusable("trigger", focus), onClosed });
    undo();
    expect(dialog.listenerCount()).toBe(0);
    expect(dialog.open).toBe(false);
    expect(focus).toEqual(["trigger (no scroll)"]);
    dialog.flush();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("undoing it after a normal close does nothing more", () => {
    const dialog = fakeDialog();
    const focus: string[] = [];
    const onClosed = vi.fn();
    const undo = presentModalDialog(dialog, { returnFocus: focusable("trigger", focus), onClosed });
    dialog.close();
    dialog.flush();
    undo();
    expect(dialog.calls).toEqual(["showModal", "close"]);
    expect(focus).toEqual(["trigger (no scroll)"]);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("React's development double mount: the close event of the first showing never closes the second", () => {
    const dialog = fakeDialog();
    const onClosed = vi.fn();
    const undo = presentModalDialog(dialog, { onClosed });
    undo(); // the first cleanup closes it — its close event is queued
    presentModalDialog(dialog, { onClosed }); // shown again at once
    dialog.flush(); // the stale close event arrives while it is open
    expect(dialog.open).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    dialog.escape();
    dialog.flush();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});

/** A piece of the dialog a finger may land on: its parent, and whether it is a scroll area with something to scroll. */
interface Piece extends GestureTargetLike {
  readonly name: string;
  readonly scrollable?: boolean;
}
const piece = (name: string, parentElement: Piece | ModalDialogLike | null, scrollable = false): Piece =>
  ({ name, parentElement: parentElement as GestureTargetLike | null, scrollable });
const scrollableTest = (element: GestureTargetLike) => (element as Piece).scrollable === true;

describe("presentModalDialog — the page behind never scrolls", () => {
  function shown() {
    const dialog = fakeDialog();
    const panel = piece("panel", dialog);
    const header = piece("header", panel);
    const row = piece("row", panel);
    const region = piece("description", panel, true);
    const paragraph = piece("paragraph", region);
    presentModalDialog(dialog, { onClosed: vi.fn(), isScrollable: scrollableTest });
    const swipe = (type: "touchmove" | "wheel", target: unknown) => {
      const preventDefault = vi.fn();
      dialog.dispatch(type, target, { preventDefault });
      return preventDefault.mock.calls.length;
    };
    return { dialog, panel, header, row, region, paragraph, swipe };
  }

  it("a swipe on the backdrop, the header or a row is stopped: nothing in the dialog scrolls there, so the page would", () => {
    const { dialog, header, row, panel, swipe } = shown();
    for (const target of [dialog, header, row, panel]) expect(swipe("touchmove", target)).toBe(1);
  });

  it("a swipe inside a long description is left to the browser: the description scrolls", () => {
    const { region, paragraph, swipe } = shown();
    expect(swipe("touchmove", paragraph)).toBe(0);
    expect(swipe("touchmove", region)).toBe(0);
  });

  it("a wheel or a trackpad turn follows the same rule", () => {
    const { dialog, paragraph, swipe } = shown();
    expect(swipe("wheel", dialog)).toBe(1);
    expect(swipe("wheel", paragraph)).toBe(0);
  });

  it("listens to the gestures WITHOUT the passive flag — a passive listener could not stop them", () => {
    const { dialog } = shown();
    expect(dialog.optionsOf.get("touchmove")).toEqual({ passive: false });
    expect(dialog.optionsOf.get("wheel")).toEqual({ passive: false });
  });

  it("listens on the dialog itself, and its gesture listeners go with it", () => {
    const dialog = fakeDialog();
    const undo = presentModalDialog(dialog, { onClosed: vi.fn(), isScrollable: scrollableTest });
    expect(dialog.optionsOf.has("touchmove")).toBe(true);
    undo();
    // Every listener — gestures included — goes with the dialog.
    expect(dialog.listenerCount()).toBe(0);
  });
});

describe("scrollsInsideDialog", () => {
  const dialog = fakeDialog();
  const panel = piece("panel", dialog);
  const region = piece("description", panel, true);

  it("finds a scroll area between the target and the dialog", () => {
    expect(scrollsInsideDialog(piece("line", region), dialog, scrollableTest)).toBe(true);
  });

  it("stops at the dialog: what lies outside it — and the dialog itself — never counts", () => {
    const outside = piece("page", null, true);
    const dialogInsidePage = { ...dialog, parentElement: outside } as unknown;
    expect(scrollsInsideDialog(dialogInsidePage, dialogInsidePage, scrollableTest)).toBe(false);
    expect(scrollsInsideDialog(piece("row", panel), dialog, scrollableTest)).toBe(false);
  });

  it("an unknown target is nothing to scroll", () => {
    expect(scrollsInsideDialog(null, dialog, scrollableTest)).toBe(false);
    expect(scrollsInsideDialog(undefined, dialog, scrollableTest)).toBe(false);
  });

  it("without a browser, nothing reads as scrollable", () => {
    expect(isScrollableElement(piece("x", null))).toBe(false);
  });
});

/** A piece a key may be pressed on: its tag, and how far it can still scroll each way. */
interface KeyPiece extends GestureTargetLike {
  readonly tagName?: string;
  readonly room?: Partial<Record<ScrollDirection, boolean>>;
  getAttribute?(name: string): string | null;
}
const keyPiece = (tagName: string, parentElement: unknown, room?: KeyPiece["room"], role?: string): KeyPiece => ({
  tagName,
  parentElement: parentElement as GestureTargetLike | null,
  room,
  getAttribute: (name) => (name === "role" ? (role ?? null) : null),
});
const towards = (element: GestureTargetLike, direction: ScrollDirection) => (element as KeyPiece).room?.[direction] === true;

describe("presentModalDialog — a hardware keyboard never scrolls the page behind (an iPad's)", () => {
  function shown() {
    const dialog = fakeDialog();
    const panel = keyPiece("DIV", dialog);
    const close = keyPiece("BUTTON", panel);
    const row = keyPiece("A", panel);
    // A long description, part-way down: it can still go both ways.
    const middle = keyPiece("DIV", panel, { up: true, down: true });
    // The same description at its end: nothing more downwards.
    const end = keyPiece("DIV", panel, { up: true, down: false });
    presentModalDialog(dialog, { onClosed: vi.fn(), canScrollTowards: towards });
    const press = (target: unknown, key: string, extra: { shiftKey?: boolean; defaultPrevented?: boolean } = {}) => {
      const preventDefault = vi.fn();
      dialog.dispatch("keydown", target, { key, preventDefault, ...extra });
      return preventDefault.mock.calls.length;
    };
    return { dialog, close, row, middle, end, press };
  }
  const SCROLL_KEYS = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", "ArrowLeft", "ArrowRight"];

  it("on « Fermer », a row or the backdrop: every scrolling key is stopped — nothing in the dialog scrolls there", () => {
    const { dialog, close, row, press } = shown();
    for (const target of [close, row, dialog]) for (const key of SCROLL_KEYS) expect(press(target, key)).toBe(1);
    // Space on a link (it would scroll the page) and on the backdrop.
    expect(press(row, " ")).toBe(1);
    expect(press(dialog, " ", { shiftKey: true })).toBe(1);
  });

  it("inside a long description, the keys scroll IT while it can move that way — and stop at its end", () => {
    const { middle, end, press } = shown();
    for (const key of ["ArrowDown", "PageDown", "End", " ", "ArrowUp", "PageUp", "Home"]) expect(press(middle, key)).toBe(0);
    // At its end: downwards would chain to the page — stopped; upwards still scrolls the description.
    for (const key of ["ArrowDown", "PageDown", "End", " "]) expect(press(end, key)).toBe(1);
    for (const key of ["ArrowUp", "PageUp", "Home"]) expect(press(end, key)).toBe(0);
    expect(press(end, " ", { shiftKey: true })).toBe(0);
  });

  it("never takes a button's Space (it activates it), nor a field's keys (its caret, its value)", () => {
    const { dialog, close, press } = shown();
    expect(press(close, " ")).toBe(0);
    expect(press(keyPiece("A", dialog, undefined, "button"), " ")).toBe(0);
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) for (const key of [...SCROLL_KEYS, " "]) expect(press(keyPiece(tag, dialog), key)).toBe(0);
  });

  it("never touches Tab, Shift + Tab, Enter or Escape — nor a key something else already handled", () => {
    const { close, row, press } = shown();
    for (const key of ["Tab", "Enter", "Escape", "a"]) expect(press(close, key)).toBe(0);
    expect(press(row, "Tab", { shiftKey: true })).toBe(0);
    expect(press(row, "ArrowDown", { defaultPrevented: true })).toBe(0);
  });

  it("its key listener goes with the dialog", () => {
    const dialog = fakeDialog();
    const undo = presentModalDialog(dialog, { onClosed: vi.fn(), canScrollTowards: towards });
    undo();
    expect(dialog.listenerCount()).toBe(0);
  });
});

describe("the keys, one by one", () => {
  it("say where they scroll — Space down, Shift + Space up", () => {
    expect(["ArrowDown", "PageDown", "End"].map((key) => scrollDirectionOfKey({ key }))).toEqual(["down", "down", "down"]);
    expect(["ArrowUp", "PageUp", "Home"].map((key) => scrollDirectionOfKey({ key }))).toEqual(["up", "up", "up"]);
    expect(scrollDirectionOfKey({ key: " " })).toBe("down");
    expect(scrollDirectionOfKey({ key: " ", shiftKey: true })).toBe("up");
    expect(scrollDirectionOfKey({ key: "ArrowLeft" })).toBe("left");
    expect(scrollDirectionOfKey({ key: "Tab" })).toBeUndefined();
  });

  it("a field keeps every key; a button keeps only Space", () => {
    expect(controlKeepsKey(keyPiece("INPUT", null), "ArrowDown")).toBe(true);
    expect(controlKeepsKey(keyPiece("BUTTON", null), " ")).toBe(true);
    expect(controlKeepsKey(keyPiece("BUTTON", null), "ArrowDown")).toBe(false);
    expect(controlKeepsKey(keyPiece("A", null), " ")).toBe(false);
    expect(controlKeepsKey({ isContentEditable: true, tagName: "DIV" }, "End")).toBe(true);
    expect(controlKeepsKey(null, " ")).toBe(false);
  });

  it("only a scroll area INSIDE the dialog counts — never the dialog itself, never what lies outside", () => {
    const dialog = fakeDialog();
    const area = keyPiece("DIV", dialog, { down: true });
    expect(scrollsInsideDialogTowards(keyPiece("P", area), dialog, "down", towards)).toBe(true);
    expect(scrollsInsideDialogTowards(keyPiece("P", area), dialog, "up", towards)).toBe(false);
    expect(scrollsInsideDialogTowards(dialog, dialog, "down", towards)).toBe(false);
    expect(canElementScrollTowards(area, "down")).toBe(false); // without a browser: nothing scrolls
  });
});
