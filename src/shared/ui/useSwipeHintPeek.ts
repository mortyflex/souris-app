// BeautIzzy — the one swipe discoverability « peek »
//
// Shared by every swipeable row (SwipeToDeleteRow, SwipeActionRow), so the
// demonstration moves the same way everywhere: once the screen has settled,
// the designated row slides toward its swipe direction by SWIPE_HINT_OFFSET,
// decelerating; holds while the revealed glyph is readable; then returns to
// rest, slower and eased in and out. No spring, no bounce, no haptic, no loop.
//
// The peek is a translation of the row only: it never opens the swipeable,
// never crosses a reveal or commit threshold and so never runs an action.
// It plays at most once per row instance, never under Reduce Motion, and
// any touch on the row (`cancelHint`) cancels a pending peek or settles a
// running one back to rest at once — a scroll or a tap always wins.

import { useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  shouldPlaySwipeHint,
  SWIPE_HINT_DELAY_MS,
  SWIPE_HINT_HOLD_MS,
  SWIPE_HINT_OFFSET,
  SWIPE_HINT_RETURN_EASING,
  SWIPE_HINT_RETURN_MS,
  SWIPE_HINT_REVEAL_MS,
  SWIPE_HINT_TOTAL_MS,
} from './swipe-to-delete';
import { duration, easing } from './theme';

const REVEAL_EASING = Easing.bezier(...easing.out);
const RETURN_EASING = Easing.bezier(...SWIPE_HINT_RETURN_EASING);

export function useSwipeHintPeek(hint: boolean) {
  const reduceMotion = useReducedMotion();
  const peek = useSharedValue(0);
  const played = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [hintVisible, setHintVisible] = useState(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!shouldPlaySwipeHint({ hint, reduceMotion, played: played.current })) return;
    played.current = true;
    const start = setTimeout(() => {
      setHintVisible(true);
      peek.set(
        withSequence(
          withTiming(SWIPE_HINT_OFFSET, { duration: SWIPE_HINT_REVEAL_MS, easing: REVEAL_EASING }),
          withDelay(SWIPE_HINT_HOLD_MS, withTiming(0, { duration: SWIPE_HINT_RETURN_MS, easing: RETURN_EASING })),
        ),
      );
      timers.current.push(setTimeout(() => setHintVisible(false), SWIPE_HINT_TOTAL_MS));
    }, SWIPE_HINT_DELAY_MS);
    timers.current.push(start);
    return clearTimers;
    // One-shot per row instance; later prop changes never replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelHint = () => {
    played.current = true;
    clearTimers();
    cancelAnimation(peek);
    peek.set(withTiming(0, { duration: duration.tap }));
    setHintVisible(false);
  };

  const peekStyle = useAnimatedStyle(() => ({ transform: [{ translateX: peek.get() }] }));

  return { hintVisible, peekStyle, cancelHint };
}
