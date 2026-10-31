import {
  DELETE_ACTION_WIDTH,
  getFullSwipeThreshold,
  hasHorizontalSwipeIntent,
  isFullSwipe,
  MIN_FULL_SWIPE_DISTANCE,
  shouldPlaySwipeHint,
  SWIPE_ACTION_WIDTH,
  SWIPE_ACTIVATION_DISTANCE,
  SWIPE_HINT_DELAY_MS,
  SWIPE_HINT_HOLD_MS,
  SWIPE_HINT_OFFSET,
  SWIPE_HINT_RETURN_EASING,
  SWIPE_HINT_RETURN_MS,
  SWIPE_HINT_REVEAL_MS,
  SWIPE_HINT_TOTAL_MS,
  SWIPE_INTENT_DISTANCE,
} from '../swipe-to-delete';

describe('swipe-to-delete thresholds', () => {
  it('reveals the action well before the full-swipe commit', () => {
    expect(DELETE_ACTION_WIDTH).toBeLessThan(MIN_FULL_SWIPE_DISTANCE);
    expect(isFullSwipe(DELETE_ACTION_WIDTH, 360)).toBe(false);
  });

  it('scales the full-swipe threshold with the measured row width', () => {
    expect(getFullSwipeThreshold(360)).toBe(216);
    expect(isFullSwipe(215, 360)).toBe(false);
    expect(isFullSwipe(216, 360)).toBe(true);
  });

  it('keeps a floor for unmeasured or narrow rows so a short drag never commits', () => {
    expect(getFullSwipeThreshold(0)).toBe(MIN_FULL_SWIPE_DISTANCE);
    expect(getFullSwipeThreshold(200)).toBe(MIN_FULL_SWIPE_DISTANCE);
    expect(isFullSwipe(120, 0)).toBe(false);
    expect(isFullSwipe(MIN_FULL_SWIPE_DISTANCE, 0)).toBe(true);
  });
});

describe('swipe hint decision', () => {
  it('peeks a recognisable part of the action, yet clearly short of an open row', () => {
    // 45–65 pt: the glyph is readable, the row never looks swiped open or deleted.
    expect(SWIPE_HINT_OFFSET).toBeGreaterThanOrEqual(45);
    expect(SWIPE_HINT_OFFSET).toBeLessThanOrEqual(65);
    expect(SWIPE_HINT_OFFSET).toBeLessThan(DELETE_ACTION_WIDTH);
    expect(SWIPE_HINT_OFFSET).toBeLessThan(SWIPE_ACTION_WIDTH);
    expect(SWIPE_HINT_OFFSET).toBeLessThan(MIN_FULL_SWIPE_DISTANCE);
  });

  it('settles first, reveals, holds while readable, then returns noticeably slower — one pass', () => {
    expect(SWIPE_HINT_DELAY_MS).toBeGreaterThanOrEqual(350);
    expect(SWIPE_HINT_DELAY_MS).toBeLessThanOrEqual(500);
    expect(SWIPE_HINT_REVEAL_MS).toBeGreaterThanOrEqual(300);
    expect(SWIPE_HINT_REVEAL_MS).toBeLessThanOrEqual(400);
    expect(SWIPE_HINT_HOLD_MS).toBeGreaterThanOrEqual(350);
    expect(SWIPE_HINT_HOLD_MS).toBeLessThanOrEqual(500);
    expect(SWIPE_HINT_RETURN_MS).toBeGreaterThanOrEqual(600);
    expect(SWIPE_HINT_RETURN_MS).toBeLessThanOrEqual(800);
    expect(SWIPE_HINT_RETURN_MS).toBeGreaterThan(SWIPE_HINT_REVEAL_MS);
    expect(SWIPE_HINT_TOTAL_MS).toBe(SWIPE_HINT_REVEAL_MS + SWIPE_HINT_HOLD_MS + SWIPE_HINT_RETURN_MS);
  });

  it('returns with a soft ease-in-out: no overshoot, so no bounce', () => {
    const [x1, y1, x2, y2] = SWIPE_HINT_RETURN_EASING;
    for (const value of [x1, y1, x2, y2]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(y1).toBeLessThan(x1); // eases in…
    expect(y2).toBeGreaterThan(x2); // …and out
  });

  it('plays only for the designated row, once, and never under reduced motion', () => {
    expect(shouldPlaySwipeHint({ hint: true, reduceMotion: false, played: false })).toBe(true);
    expect(shouldPlaySwipeHint({ hint: false, reduceMotion: false, played: false })).toBe(false);
    expect(shouldPlaySwipeHint({ hint: true, reduceMotion: true, played: false })).toBe(false);
    expect(shouldPlaySwipeHint({ hint: true, reduceMotion: false, played: true })).toBe(false);
  });
});

describe('swipe press guard — a swipe is never a tap', () => {
  it('withdraws the press before the swipe gesture itself starts to move the row', () => {
    expect(SWIPE_INTENT_DISTANCE).toBeLessThan(SWIPE_ACTIVATION_DISTANCE);
    expect(hasHorizontalSwipeIntent(SWIPE_INTENT_DISTANCE, 0)).toBe(true);
  });

  it('leaves a tap alone, even with the jitter of a finger', () => {
    expect(hasHorizontalSwipeIntent(0, 0)).toBe(false);
    expect(hasHorizontalSwipeIntent(3, 2)).toBe(false);
    expect(hasHorizontalSwipeIntent(SWIPE_INTENT_DISTANCE - 1, 0)).toBe(false);
  });

  it('reads both horizontal directions as a swipe', () => {
    expect(hasHorizontalSwipeIntent(24, 3)).toBe(true);
    expect(hasHorizontalSwipeIntent(-24, 3)).toBe(true);
  });

  it('never mistakes a vertical scroll for a swipe', () => {
    expect(hasHorizontalSwipeIntent(10, 40)).toBe(false);
    expect(hasHorizontalSwipeIntent(-12, -60)).toBe(false);
    // A diagonal that is mostly vertical still belongs to the scroll view.
    expect(hasHorizontalSwipeIntent(20, 21)).toBe(false);
  });
});
