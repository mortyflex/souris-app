// Souris — SwipeToDeleteRow
//
// The ONE Souris swipe-to-delete interaction, shared by every deletable row
// (Appointment « Produits vendus », Appointment editing Services). The row
// is swiped to the RIGHT:
//
//   partial swipe → the row follows the finger, the rose destructive surface
//                   grows behind it and the trash appears; releasing before
//                   the full-swipe threshold leaves the trash available and
//                   tapping it deletes;
//   full swipe    → the surface keeps following the finger across the row;
//                   releasing past the threshold commits the deletion ONCE.
//
// Built on the gesture-handler / Reanimated swipeable primitive already in
// the project. Haptics are restrained: one selection tick when the
// full-swipe threshold is crossed; the commit haptic belongs to the caller,
// who knows what was deleted. `onDelete` returns whether the deletion was
// committed — when it was not (a persistence refusal) the row simply closes
// again, so the UI follows the committed state.
//
// Discoverability: with `hint`, the row plays ONE « peek » once it is
// mounted and the screen has settled — rest → ~28 pt reveal of the
// destructive surface and trash → a brief hold while the trash is readable
// → smooth return. No bounce, no loop, no overlay, no haptic. Skipped
// entirely under reduced motion; cancelled by any touch before or while it
// plays. Screens designate at most ONE row per instance (`useSwipeHintTarget`).
//
// This component knows nothing about Products, Sales or Services: wording
// (accessibility label) and semantics stay with the caller.

import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/shared/lib/haptics';

import {
  DELETE_ACTION_WIDTH,
  isFullSwipe,
  shouldPlaySwipeHint,
  SWIPE_HINT_DELAY_MS,
  SWIPE_HINT_HOLD_MS,
  SWIPE_HINT_OFFSET,
  SWIPE_HINT_RETURN_MS,
  SWIPE_HINT_REVEAL_MS,
  SWIPE_HINT_TOTAL_MS,
} from './swipe-to-delete';
import { duration, easing, rose, semanticColors, spacing } from './theme';

/** SF Symbol on iOS, Material Symbol on Android; never emoji. */
const trashIcon = { ios: 'trash.fill', android: 'delete' } as const;
const HINT_EASING = Easing.bezier(...easing.out);

interface SwipeToDeleteRowProps {
  /** Contextual wording, e.g. « Supprimer X des produits vendus » / « Retirer X du rendez-vous ». */
  readonly deleteAccessibilityLabel: string;
  /** Performs the deletion; returns whether it was committed. */
  readonly onDelete: () => boolean;
  /** Plays the one-time discoverability peek on this row. */
  readonly hint?: boolean;
  /** Opaque background of the swiped content, hiding the surfaces beneath it at rest. */
  readonly surfaceColor: string;
  /** Rounds and clips the row itself (a standalone card) instead of relying on a clipping parent. */
  readonly borderRadius?: number;
  readonly testID: string;
  readonly deleteTestID: string;
}

interface DeleteActionProps {
  readonly translation: SharedValue<number>;
  readonly rowWidth: SharedValue<number>;
  readonly armed: SharedValue<boolean>;
  readonly accessibilityLabel: string;
  readonly testID: string;
  readonly onPress: () => void;
}

function DeleteAction({
  translation,
  rowWidth,
  armed,
  accessibilityLabel,
  testID,
  onPress,
}: DeleteActionProps) {
  // Arms / disarms the full-swipe commit as the finger crosses the threshold
  // in either direction; ONE selection tick per crossing into the armed state.
  useAnimatedReaction(
    () => isFullSwipe(translation.get(), rowWidth.get()),
    (isArmed, wasArmed) => {
      if (isArmed === wasArmed) return;
      armed.set(isArmed);
      if (isArmed) scheduleOnRN(haptics.selection);
    },
  );

  const surface = useAnimatedStyle(() => ({ width: Math.max(translation.get(), 0) }));
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(
      translation.get(),
      [0, DELETE_ACTION_WIDTH * 0.4, DELETE_ACTION_WIDTH],
      [0, 0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          translation.get(),
          [DELETE_ACTION_WIDTH * 0.4, DELETE_ACTION_WIDTH],
          [0.7, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={styles.action}>
      <Animated.View pointerEvents="none" style={[styles.actionSurface, surface]} />
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.trash}
        testID={testID}
      >
        <Animated.View style={icon}>
          <SymbolView name={trashIcon} size={22} tintColor={semanticColors.surfaceElevated} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Captures, once per screen instance, the row that receives the
 * discoverability hint: the first eligible row present when the screen
 * mounts. Rows added or promoted later never replay it.
 */
export function useSwipeHintTarget(firstKey: string | undefined): string | undefined {
  const [target] = useState(firstKey);
  return target;
}

export function SwipeToDeleteRow({
  children,
  deleteAccessibilityLabel,
  onDelete,
  hint = false,
  surfaceColor,
  borderRadius,
  testID,
  deleteTestID,
}: PropsWithChildren<SwipeToDeleteRowProps>) {
  const reduceMotion = useReducedMotion();
  const swipeable = useRef<SwipeableMethods>(null);
  const rowWidth = useSharedValue(0);
  const armed = useSharedValue(false);
  const peek = useSharedValue(0);
  // JS-side single-fire guard: a release past the threshold and a trash tap
  // can never delete the same row twice.
  const committed = useRef(false);
  const hintPlayed = useRef(false);
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [hintVisible, setHintVisible] = useState(false);

  const clearHintTimers = () => {
    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];
  };

  useEffect(() => {
    if (!shouldPlaySwipeHint({ hint, reduceMotion, played: hintPlayed.current })) return;
    hintPlayed.current = true;
    const start = setTimeout(() => {
      setHintVisible(true);
      // reveal → hold (trash readable) → return; one pass, no bounce.
      peek.set(
        withSequence(
          withTiming(SWIPE_HINT_OFFSET, { duration: SWIPE_HINT_REVEAL_MS, easing: HINT_EASING }),
          withDelay(
            SWIPE_HINT_HOLD_MS,
            withTiming(0, { duration: SWIPE_HINT_RETURN_MS, easing: HINT_EASING }),
          ),
        ),
      );
      const end = setTimeout(() => setHintVisible(false), SWIPE_HINT_TOTAL_MS);
      hintTimers.current.push(end);
    }, SWIPE_HINT_DELAY_MS);
    hintTimers.current.push(start);
    return clearHintTimers;
    // The hint is a one-shot per row instance; later prop changes never replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any touch on the row takes over: a pending hint never fires and a
  // running one settles back to rest immediately.
  const cancelHint = () => {
    if (!hintPlayed.current) hintPlayed.current = true;
    clearHintTimers();
    cancelAnimation(peek);
    peek.set(withTiming(0, { duration: duration.tap }));
    setHintVisible(false);
  };

  const commitDeletion = () => {
    if (committed.current) return;
    committed.current = true;
    if (onDelete()) return;
    committed.current = false;
    swipeable.current?.close();
  };

  const onRelease = () => {
    if (armed.get()) commitDeletion();
  };

  const onRowLayout = (event: LayoutChangeEvent) => {
    rowWidth.set(event.nativeEvent.layout.width);
  };

  const peekStyle = useAnimatedStyle(() => ({ transform: [{ translateX: peek.get() }] }));

  return (
    <View
      onLayout={onRowLayout}
      onTouchStart={cancelHint}
      style={[styles.row, borderRadius !== undefined && { borderCurve: 'continuous', borderRadius }]}
    >
      {hintVisible && (
        <View pointerEvents="none" style={styles.hintSurface} testID={`${testID}-hint`}>
          <SymbolView name={trashIcon} size={22} tintColor={semanticColors.surfaceElevated} />
        </View>
      )}
      <Animated.View style={peekStyle}>
        <ReanimatedSwipeable
          ref={swipeable}
          childrenContainerStyle={{ backgroundColor: surfaceColor }}
          dragOffsetFromLeftEdge={12}
          leftThreshold={DELETE_ACTION_WIDTH}
          onSwipeableWillOpen={onRelease}
          overshootFriction={1}
          overshootLeft
          renderLeftActions={(_progress, translation) => (
            <DeleteAction
              accessibilityLabel={deleteAccessibilityLabel}
              armed={armed}
              onPress={commitDeletion}
              rowWidth={rowWidth}
              testID={deleteTestID}
              translation={translation}
            />
          )}
          testID={testID}
        >
          {children}
        </ReanimatedSwipeable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { overflow: 'hidden' },
  hintSurface: {
    backgroundColor: rose.rose600,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingLeft: spacing.xs,
    position: 'absolute',
    top: 0,
    width: DELETE_ACTION_WIDTH,
  },
  action: { width: DELETE_ACTION_WIDTH },
  actionSurface: {
    backgroundColor: rose.rose600,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  trash: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: DELETE_ACTION_WIDTH,
  },
});
