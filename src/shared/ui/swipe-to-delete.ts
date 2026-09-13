// Souris — swipe-to-delete rules (pure)
//
// The distances and the discoverability rule of the shared SwipeToDeleteRow,
// shared by the UI-thread worklets and their tests:
//
//   partial swipe  → the destructive action is revealed and stays available
//                    (the swipeable opens at DELETE_ACTION_WIDTH);
//   full swipe     → past the full-swipe threshold the release commits the
//                    deletion once;
//   hint           → one automatic « peek » (rest → clearly visible partial
//                    reveal → brief hold while the trash is readable → smooth
//                    return) on ONE row per screen, skipped under reduced
//                    motion and never repeated.
//
// The full-swipe threshold scales with the measured row width so it is
// "clearly crossed" on every device, with a floor for rows that have not
// been measured yet.

export const DELETE_ACTION_WIDTH = 72;

/** Fraction of the row width the finger must travel before release commits. */
export const FULL_SWIPE_RATIO = 0.6;

/** Floor for the full-swipe distance (unmeasured or very narrow rows). */
export const MIN_FULL_SWIPE_DISTANCE = DELETE_ACTION_WIDTH * 2.5;

export function getFullSwipeThreshold(rowWidth: number): number {
  'worklet';
  return Math.max(rowWidth * FULL_SWIPE_RATIO, MIN_FULL_SWIPE_DISTANCE);
}

/** True once the horizontal translation clearly crossed the full-swipe threshold. */
export function isFullSwipe(translation: number, rowWidth: number): boolean {
  'worklet';
  return translation >= getFullSwipeThreshold(rowWidth);
}

/** How far the hint peeks (points): a clearly visible partial swipe, still far from open. */
export const SWIPE_HINT_OFFSET = 28;

/** Settle time before the hint starts, so the screen has finished presenting. */
export const SWIPE_HINT_DELAY_MS = 500;

export const SWIPE_HINT_REVEAL_MS = 300;
/** Pause at the revealed position so the trash is readable before the return. */
export const SWIPE_HINT_HOLD_MS = 300;
export const SWIPE_HINT_RETURN_MS = 320;

/** Reveal → hold → return: how long the hint surface stays visible once started. */
export const SWIPE_HINT_TOTAL_MS = SWIPE_HINT_REVEAL_MS + SWIPE_HINT_HOLD_MS + SWIPE_HINT_RETURN_MS;

export interface SwipeHintDecision {
  /** The row was designated as the hint target by its screen. */
  readonly hint: boolean;
  readonly reduceMotion: boolean;
  /** The hint already ran (or was cancelled) for this row instance. */
  readonly played: boolean;
}

/** A hint plays at most once per row instance, never under reduced motion. */
export function shouldPlaySwipeHint({ hint, reduceMotion, played }: SwipeHintDecision): boolean {
  return hint && !reduceMotion && !played;
}
