// BeautIzzy — SwipeToDeleteRow
//
// The ONE BeautIzzy swipe-to-delete interaction, shared by every deletable row
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
// Discoverability: with `hint`, the row plays the shared BeautIzzy « peek »
// (`useSwipeHintPeek`) once the screen has settled — rest → a ~52 pt reveal of
// the destructive surface with the trash centred in it → a readable hold →
// a slower, eased return. No bounce, no loop, no overlay, no haptic, and it
// never deletes. Skipped entirely under reduced motion; cancelled by any
// touch before or while it plays. Screens designate at most ONE row per
// instance (`useSwipeHintTarget`).
//
// Swipe never taps: a row's content often has its own press — a header that
// expands / collapses the card, steppers, buttons. Those are React Native
// presses, and nothing cancels them when the swipe starts: gesture-handler
// withdraws React Native touches by walking up to the app's root surface,
// which a modally presented screen (every BeautIzzy sheet route) is not part of.
// Worse, the row FOLLOWS the finger, so the touch never leaves the pressed
// element: releasing a swipe fired its `onPress` and toggled the card. The
// content wrapper therefore claims the JS responder as soon as the touch shows
// horizontal intent (`hasHorizontalSwipeIntent`, before the pan activates):
// the pressed element is terminated and can no longer fire. The native swipe,
// the reorder long-press and vertical scrolling are separate native gestures
// and are untouched; a plain tap never moves sideways, so it still presses.
//
// Android: the trash is NOT rendered inside the swipeable. The primitive's
// invisible right-actions container sits above its left actions and Android
// hit-testing ignores opacity, so a trash drawn there never received a tap.
// The swipeable renders the rose surface and a 72 pt placeholder; the trash
// is drawn by `SwipeRevealedAction`, above the swipeable, clipped to the
// uncovered strip (see SwipeRevealedAction.tsx).
//
// This component knows nothing about Products, Sales or Services: wording
// (accessibility label) and semantics stay with the caller.

import { SymbolView } from 'expo-symbols';
import { useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/shared/lib/haptics';

import {
  DELETE_ACTION_WIDTH,
  isFullSwipe,
  SWIPE_ACTIVATION_DISTANCE,
  SWIPE_HINT_OFFSET,
} from './swipe-to-delete';
import { SwipeRevealedAction, SwipeRevealSpacer, useSwipeTapGuard } from './SwipeRevealedAction';
import { rose, semanticColors } from './theme';
import { useSwipeHintPeek } from './useSwipeHintPeek';

/** SF Symbol on iOS, Material Symbol on Android; never emoji. */
const trashIcon = { ios: 'trash.fill', android: 'delete' } as const;

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

interface DeleteSurfaceProps {
  readonly translation: SharedValue<number>;
  readonly revealed: SharedValue<number>;
  readonly rowWidth: SharedValue<number>;
  readonly armed: SharedValue<boolean>;
}

/** Rendered by the swipeable: the growing rose surface and the 72 pt placeholder of the trash. */
function DeleteSurface({ translation, revealed, rowWidth, armed }: DeleteSurfaceProps) {
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

  return (
    <View pointerEvents="none">
      <Animated.View style={[styles.actionSurface, surface]} />
      <SwipeRevealSpacer revealed={revealed} translation={translation} width={DELETE_ACTION_WIDTH} />
    </View>
  );
}

interface TrashButtonProps {
  readonly revealed: SharedValue<number>;
  readonly accessibilityLabel: string;
  readonly testID: string;
  readonly onPress: () => void;
}

/** The trash itself, drawn in the revealed layer: fades and scales in as the row uncovers it. */
function TrashButton({ revealed, accessibilityLabel, testID, onPress }: TrashButtonProps) {
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(
      revealed.get(),
      [0, DELETE_ACTION_WIDTH * 0.4, DELETE_ACTION_WIDTH],
      [0, 0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          revealed.get(),
          [DELETE_ACTION_WIDTH * 0.4, DELETE_ACTION_WIDTH],
          [0.7, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.trash}
      testID={testID}
    >
      <Animated.View style={icon}>
        <SymbolView name={trashIcon} size={22} tintColor={semanticColors.onAccent} />
      </Animated.View>
    </Pressable>
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
  const swipeable = useRef<SwipeableMethods>(null);
  const rowWidth = useSharedValue(0);
  const armed = useSharedValue(false);
  // The swipeable's live translation, mirrored for the revealed trash layer.
  const revealed = useSharedValue(0);
  // JS-side single-fire guard: a release past the threshold and a trash tap
  // (or two quick taps) can never delete the same row twice.
  const committed = useRef(false);
  // Any touch on the row takes over: a pending hint never fires and a
  // running one settles back to rest immediately.
  const { hintVisible, peekStyle, cancelHint } = useSwipeHintPeek(hint);
  // Swipe never taps (see the header).
  const swipeGuard = useSwipeTapGuard();

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

  return (
    <View
      onLayout={onRowLayout}
      onTouchStart={cancelHint}
      style={[styles.row, borderRadius !== undefined && { borderCurve: 'continuous', borderRadius }]}
    >
      {hintVisible && (
        <View pointerEvents="none" style={styles.hintSurface} testID={`${testID}-hint`}>
          <SymbolView name={trashIcon} size={22} tintColor={semanticColors.onAccent} />
        </View>
      )}
      <Animated.View style={peekStyle}>
        <ReanimatedSwipeable
          ref={swipeable}
          childrenContainerStyle={{ backgroundColor: surfaceColor }}
          dragOffsetFromLeftEdge={SWIPE_ACTIVATION_DISTANCE}
          leftThreshold={DELETE_ACTION_WIDTH}
          onSwipeableWillOpen={onRelease}
          overshootFriction={1}
          overshootLeft
          renderLeftActions={(_progress, translation) => (
            <DeleteSurface armed={armed} revealed={revealed} rowWidth={rowWidth} translation={translation} />
          )}
          testID={testID}
        >
          <View {...swipeGuard} testID={`${testID}-content`}>
            {children}
          </View>
        </ReanimatedSwipeable>
      </Animated.View>
      <SwipeRevealedAction revealed={revealed} testID={`${testID}-revealed`} width={DELETE_ACTION_WIDTH}>
        <TrashButton
          accessibilityLabel={deleteAccessibilityLabel}
          onPress={commitDeletion}
          revealed={revealed}
          testID={deleteTestID}
        />
      </SwipeRevealedAction>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { overflow: 'hidden' },
  // Exactly the revealed strip, trash centred in it.
  hintSurface: {
    alignItems: 'center',
    backgroundColor: rose.rose600,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: SWIPE_HINT_OFFSET,
  },
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
