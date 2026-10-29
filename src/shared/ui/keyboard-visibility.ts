// BeautIzzy — keyboard visibility (plain TypeScript, no React)
//
// The geometry behind FormScrollView. Given where the focused input sits in a
// scrolling form, how tall the viewport is and how much of it the keyboard
// hides, decide the ONE scroll offset that keeps the field readable — or that
// nothing needs to move. Every value is a measurement; nothing is predicted.
//
// Coordinates: the offset and the input are in CONTENT coordinates (the input
// never moves with the scroll); the viewport and the keyboard are compared in
// WINDOW coordinates, where React Native reports the keyboard frame.

export interface FocusedInputGeometry {
  /** Current scroll offset: how much content already lies above the viewport. */
  readonly offset: number;
  /** Height of the scroll viewport (the ScrollView's own frame). */
  readonly viewportHeight: number;
  /** Bottom part of the viewport hidden behind the keyboard; 0 when it sits above it. */
  readonly keyboardOverlap: number;
  /** Total height of the scroll content, the keyboard spacer included; unknown before the first layout. */
  readonly contentHeight?: number;
  /** Focused input, in content coordinates. */
  readonly inputTop: number;
  readonly inputHeight: number;
  /** Comfortable gap kept between the input and the visible edges. */
  readonly margin: number;
}

/**
 * The offset that reveals the focused input with its margin, or `undefined`
 * when the input is already visible (nothing moves, no micro-scroll).
 *
 * A field hidden below — or under the keyboard — is brought up by its bottom
 * edge: for a field taller than the visible area that shows its end, where
 * the caret usually is. A field hidden above is brought down by its top edge,
 * only when it fits whole, so a tall multiline field never oscillates.
 */
export function resolveRevealOffset(geometry: FocusedInputGeometry): number | undefined {
  const { offset, viewportHeight, keyboardOverlap, contentHeight, inputTop, inputHeight, margin } = geometry;
  const visibleHeight = Math.max(0, viewportHeight - keyboardOverlap);
  const visibleTop = offset;
  const visibleBottom = offset + visibleHeight;
  const inputBottom = inputTop + inputHeight;

  let target: number;
  if (inputBottom + margin > visibleBottom) {
    target = inputBottom + margin - visibleHeight;
  } else if (inputTop - margin < visibleTop && inputHeight + 2 * margin <= visibleHeight) {
    target = inputTop - margin;
  } else {
    return undefined;
  }

  const maxOffset = contentHeight === undefined ? Number.POSITIVE_INFINITY : Math.max(0, contentHeight - viewportHeight);
  target = Math.min(Math.max(target, 0), maxOffset);
  return Math.abs(target - offset) < 1 ? undefined : target;
}

export interface SettledOffsetGeometry {
  readonly offset: number;
  readonly viewportHeight: number;
  readonly contentHeight: number;
}

/**
 * Once the keyboard has closed (viewport grown back, spacer gone), an offset
 * that now points past the end of the content leaves a blank area: this is the
 * end of the content to settle on, or `undefined` when the offset is fine.
 */
export function resolveSettledOffset({ offset, viewportHeight, contentHeight }: SettledOffsetGeometry): number | undefined {
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  return offset > maxOffset + 0.5 ? maxOffset : undefined;
}

export interface KeyboardOverlapGeometry {
  /** Viewport frame, in window coordinates. */
  readonly viewportTop: number;
  readonly viewportHeight: number;
  /** Top edge of the keyboard, in window coordinates. */
  readonly keyboardTop: number;
}

/** How much of the viewport's bottom the keyboard covers (0 when the viewport sits above it). */
export function resolveKeyboardOverlap({ viewportTop, viewportHeight, keyboardTop }: KeyboardOverlapGeometry): number {
  return Math.max(0, viewportTop + viewportHeight - keyboardTop);
}

export interface KeyboardFrame {
  /** Top edge of the keyboard, in window coordinates. */
  readonly screenY: number;
  readonly height: number;
}

/**
 * The top edge of a keyboard that is really on screen, or `undefined`: a frame
 * parked below the window is a hiding keyboard, and a frame at the very top
 * (iOS « Prefer Cross-Fade Transitions ») carries no usable position.
 */
export function resolveKeyboardTop(frame: KeyboardFrame, windowHeight: number): number | undefined {
  if (frame.height <= 0 || frame.screenY <= 0 || frame.screenY >= windowHeight) return undefined;
  return frame.screenY;
}
