import { describe, expect, it, vi } from "vitest";

import { presentModalDialog, type DialogEventLike, type FocusableLike, type ModalDialogLike } from "../modal-dialog";

type Listener = (event: DialogEventLike) => void;

/** A stand-in `<dialog>`: `close()` queues its `close` event, as the browser does (a task, later). */
function fakeDialog() {
  const listeners = new Map<string, Set<Listener>>();
  const queued: Array<() => void> = [];
  const calls: string[] = [];
  const dialog: ModalDialogLike & {
    dispatch: (type: string, target?: unknown) => void;
    flush: () => void;
    escape: () => void;
    calls: string[];
    listenerCount: () => number;
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
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, target = dialog) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ target });
    },
    flush() {
      while (queued.length > 0) queued.shift()!();
    },
    // The browser's own Escape: `cancel`, then the dialog closes.
    escape() {
      dialog.close();
    },
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
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
