import {
  DELETE_ACTION_WIDTH,
  getFullSwipeThreshold,
  hasHorizontalSwipeIntent,
  isFullSwipe,
  MIN_FULL_SWIPE_DISTANCE,
  shouldPlaySwipeHint,
  SWIPE_ACTIVATION_DISTANCE,
  SWIPE_HINT_DELAY_MS,
  SWIPE_HINT_HOLD_MS,
  SWIPE_HINT_OFFSET,
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
  it('peeks clearly (well beyond the first 16 pt attempt) yet far from an open row', () => {
    expect(SWIPE_HINT_OFFSET).toBeGreaterThan(16);
    expect(SWIPE_HINT_OFFSET).toBeGreaterThanOrEqual(26);
    expect(SWIPE_HINT_OFFSET).toBeLessThanOrEqual(30);
    expect(SWIPE_HINT_OFFSET).toBeLessThan(DELETE_ACTION_WIDTH / 2);
  });

  it('settles first, reveals, holds while the trash is readable, then returns — one pass', () => {
    expect(SWIPE_HINT_DELAY_MS).toBeGreaterThanOrEqual(450);
    expect(SWIPE_HINT_REVEAL_MS).toBeGreaterThanOrEqual(280);
    expect(SWIPE_HINT_HOLD_MS).toBeGreaterThanOrEqual(250);
    expect(SWIPE_HINT_HOLD_MS).toBeLessThanOrEqual(350);
    expect(SWIPE_HINT_RETURN_MS).toBeGreaterThanOrEqual(300);
    expect(SWIPE_HINT_TOTAL_MS).toBe(SWIPE_HINT_REVEAL_MS + SWIPE_HINT_HOLD_MS + SWIPE_HINT_RETURN_MS);
    expect(SWIPE_HINT_TOTAL_MS).toBeLessThan(1200);
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
