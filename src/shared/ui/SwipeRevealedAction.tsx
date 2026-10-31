// BeautIzzy — the tappable layer of a revealed swipe action
//
// Why this exists (Android): gesture-handler's ReanimatedSwipeable renders
// its RIGHT-actions container — `absoluteFill`, empty for our rows, kept at
// opacity 0 — ABOVE the left-actions container. iOS hit-testing skips views
// whose alpha is below 0.01; React Native's Android hit-testing
// (`TouchTargetHelper`) does not. On Android every tap on a revealed LEFT
// action therefore landed on that invisible container: the trash / « Actions »
// was drawn but never received the touch.
//
// So the swipeable's `renderLeftActions` only renders a non-interactive
// placeholder of the action's width (`SwipeRevealSpacer`): the primitive still
// measures how far it opens, and the spacer mirrors the live translation into
// a shared value. The real action is drawn by `SwipeRevealedAction`, a layer
// of the row itself, ABOVE the swipeable on every platform and clipped to the
// strip the row has actually uncovered: zero wide at rest (a tap on the row
// content is never intercepted), exactly the revealed strip while swiping, the
// full action once open. What the person sees is unchanged; the visible
// action and its hit box are now the same view.
//
// A drag that starts on the revealed action is a swipe, never a tap: the
// layer claims the JS responder on horizontal intent, like the row content.

import { useRef, type PropsWithChildren } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { hasHorizontalSwipeIntent } from './swipe-to-delete';

interface SwipeRevealSpacerProps {
  /** The swipeable's live translation (second argument of `renderLeftActions`). */
  readonly translation: SharedValue<number>;
  /** Receives the translation, read by `SwipeRevealedAction`. */
  readonly revealed: SharedValue<number>;
  readonly width: number;
}

/** What the swipeable renders on its left: the action's width, nothing to see, nothing to tap. */
export function SwipeRevealSpacer({ translation, revealed, width }: SwipeRevealSpacerProps) {
  useAnimatedReaction(
    () => translation.get(),
    (value) => revealed.set(value),
  );
  return <View pointerEvents="none" style={{ width }} />;
}

/**
 * Horizontal-intent guard (see SwipeToDeleteRow): remembers where a touch
 * began and claims the JS responder once it moves sideways, so the pressed
 * element is terminated and can no longer fire.
 */
export function useSwipeTapGuard() {
  const touchOrigin = useRef<{ readonly x: number; readonly y: number } | undefined>(undefined);
  const rememberTouchOrigin = (event: GestureResponderEvent) => {
    touchOrigin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    return false;
  };
  const claimSwipe = (event: GestureResponderEvent) => {
    const origin = touchOrigin.current;
    return (
      origin !== undefined &&
      hasHorizontalSwipeIntent(event.nativeEvent.pageX - origin.x, event.nativeEvent.pageY - origin.y)
    );
  };
  return {
    onMoveShouldSetResponderCapture: claimSwipe,
    onResponderTerminationRequest: () => true,
    onStartShouldSetResponderCapture: rememberTouchOrigin,
  };
}

interface SwipeRevealedActionProps {
  readonly revealed: SharedValue<number>;
  /** Width of the action, the same as its `SwipeRevealSpacer`. */
  readonly width: number;
  readonly testID: string;
}

/** The revealed action, drawn above the swipeable and clipped to the uncovered strip. */
export function SwipeRevealedAction({ revealed, width, testID, children }: PropsWithChildren<SwipeRevealedActionProps>) {
  const guard = useSwipeTapGuard();
  const clip = useAnimatedStyle(() => ({ width: Math.min(Math.max(revealed.get(), 0), width) }));

  return (
    <Animated.View style={[styles.layer, clip]} testID={testID}>
      <View {...guard} style={[styles.action, { width }]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', top: 0 },
  action: { bottom: 0, left: 0, position: 'absolute', top: 0 },
});
