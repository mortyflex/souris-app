// BeautIzzy — keyboard visibility geometry
//
// The one rule FormScrollView applies: reveal the focused input with its
// margin when it is hidden, never move when it is already visible, settle an
// offset left past the content once the keyboard has closed.

import {
  resolveKeyboardOverlap,
  resolveKeyboardTop,
  resolveRevealOffset,
  resolveSettledOffset,
} from '../keyboard-visibility';

const MARGIN = 24;

/** A 600 pt viewport over 1200 pt of content, 200 pt of it under the keyboard. */
const base = {
  offset: 0,
  viewportHeight: 600,
  keyboardOverlap: 200,
  contentHeight: 1200,
  margin: MARGIN,
};

describe('resolveRevealOffset', () => {
  it('leaves a field that is fully visible above the keyboard alone', () => {
    expect(resolveRevealOffset({ ...base, inputTop: 100, inputHeight: 44 })).toBeUndefined();
    // Its margin fits exactly: still nothing to do.
    expect(resolveRevealOffset({ ...base, inputTop: 400 - 44 - MARGIN, inputHeight: 44 })).toBeUndefined();
  });

  it('scrolls just enough to bring a field hidden under the keyboard above it, with the margin', () => {
    // Visible area: 0..400. Field 500..544 → its bottom + margin must land at 400.
    expect(resolveRevealOffset({ ...base, inputTop: 500, inputHeight: 44 })).toBe(544 + MARGIN - 400);
  });

  it('reveals a field below the fold of an already scrolled form from the current offset', () => {
    expect(resolveRevealOffset({ ...base, offset: 300, inputTop: 900, inputHeight: 44 })).toBe(944 + MARGIN - 400);
  });

  it('scrolls back up to a field hidden above the viewport, margin included', () => {
    expect(resolveRevealOffset({ ...base, offset: 500, inputTop: 300, inputHeight: 44 })).toBe(300 - MARGIN);
    // At the very top the margin cannot be kept: the offset stops at 0.
    expect(resolveRevealOffset({ ...base, offset: 500, inputTop: 10, inputHeight: 44 })).toBe(0);
  });

  it('shows the END of a field taller than the visible area, where the caret is, and never oscillates', () => {
    // A 500 pt note in a 400 pt visible area: its bottom edge is what matters.
    const tall = { ...base, inputTop: 100, inputHeight: 500 };
    const revealed = resolveRevealOffset(tall);
    expect(revealed).toBe(600 + MARGIN - 400);
    // Its top now sits above the viewport, but it does not fit: nothing moves again.
    expect(resolveRevealOffset({ ...tall, offset: revealed ?? 0 })).toBeUndefined();
  });

  it('never scrolls past the end of the content', () => {
    // The last field: the content (spacer included) only allows 600 of offset.
    expect(resolveRevealOffset({ ...base, inputTop: 1140, inputHeight: 44 })).toBe(600);
  });

  it('ignores sub-pixel differences instead of nudging the form', () => {
    expect(resolveRevealOffset({ ...base, offset: 168.4, inputTop: 500, inputHeight: 44 })).toBeUndefined();
  });

  it('works without any keyboard overlap: the viewport then simply sits above the keyboard', () => {
    expect(resolveRevealOffset({ ...base, keyboardOverlap: 0, inputTop: 500, inputHeight: 44 })).toBeUndefined();
    expect(resolveRevealOffset({ ...base, keyboardOverlap: 0, inputTop: 700, inputHeight: 44 })).toBe(744 + MARGIN - 600);
  });
});

describe('resolveSettledOffset', () => {
  it('settles an offset left past the end of the content once the keyboard closed', () => {
    expect(resolveSettledOffset({ offset: 368, viewportHeight: 600, contentHeight: 800 })).toBe(200);
    expect(resolveSettledOffset({ offset: 368, viewportHeight: 600, contentHeight: 500 })).toBe(0);
  });

  it('leaves an offset that still points at content alone', () => {
    expect(resolveSettledOffset({ offset: 150, viewportHeight: 600, contentHeight: 800 })).toBeUndefined();
    expect(resolveSettledOffset({ offset: 200, viewportHeight: 600, contentHeight: 800 })).toBeUndefined();
  });
});

describe('resolveKeyboardOverlap', () => {
  it('measures how much of the viewport bottom the keyboard covers', () => {
    expect(resolveKeyboardOverlap({ viewportTop: 100, viewportHeight: 600, keyboardTop: 500 })).toBe(200);
  });

  it('is zero for a viewport the shell already lifted above the keyboard', () => {
    expect(resolveKeyboardOverlap({ viewportTop: 100, viewportHeight: 400, keyboardTop: 500 })).toBe(0);
    expect(resolveKeyboardOverlap({ viewportTop: 100, viewportHeight: 300, keyboardTop: 500 })).toBe(0);
  });
});

describe('resolveKeyboardTop', () => {
  it('reads the top edge of a keyboard that is on screen', () => {
    expect(resolveKeyboardTop({ screenY: 500, height: 300 }, 800)).toBe(500);
  });

  it('treats a frame parked below the window, or without height, as no keyboard', () => {
    expect(resolveKeyboardTop({ screenY: 800, height: 300 }, 800)).toBeUndefined();
    expect(resolveKeyboardTop({ screenY: 900, height: 300 }, 800)).toBeUndefined();
    expect(resolveKeyboardTop({ screenY: 500, height: 0 }, 800)).toBeUndefined();
  });

  it('ignores the positionless frame of iOS cross-fade transitions', () => {
    expect(resolveKeyboardTop({ screenY: 0, height: 300 }, 800)).toBeUndefined();
  });
});
