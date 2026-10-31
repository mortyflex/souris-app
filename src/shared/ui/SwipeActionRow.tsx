// BeautIzzy — SwipeActionRow
//
// The NON-destructive sibling of SwipeToDeleteRow: swiping the row to the
// RIGHT only REVEALS one action (a soft lavender surface, an accent glyph and
// a short label). Nothing ever happens on release: there is no full-swipe
// commit, no threshold that triggers anything. Tapping the revealed action
// calls `onAction`, which in BeautIzzy always OPENS a dedicated flow (a review
// and a confirmation) — a swipe never performs an operation by itself.
//
// Discoverability, least intrusive first:
//   * a PERSISTENT cue on every swipeable row: a short lavender grip on the
//     leading edge — the side the row is pulled from — that moves with the
//     row. Decorative (hidden from assistive technologies), never a target;
//   * the shared BeautIzzy « peek » (`useSwipeHintPeek`, the same motion as
//     SwipeToDeleteRow) on ONE row per screen instance (`hint`): rest → a
//     ~52 pt reveal with the action glyph centred in it → a readable hold →
//     a slower, eased return; skipped under Reduce Motion, cancelled by any
//     touch. The screen adds no instruction sentence: the grip and the peek
//     carry the gesture;
//   * an accessibility custom action carrying the same label, so VoiceOver /
//     TalkBack users and anyone who cannot swipe reach the action from the row
//     itself — and the screen behind the row always offers the same action as
//     a visible button.
//
// The row content keeps its own press (opening a detail): the content wrapper
// takes the JS responder only once the touch shows horizontal intent, exactly
// like SwipeToDeleteRow, so a swipe never taps.
//
// Android: the action is NOT rendered inside the swipeable — the primitive's
// invisible right-actions container sits above its left actions and Android
// hit-testing ignores opacity, so « Actions » never received a tap. The
// swipeable renders a 76 pt placeholder (which also restores the documented
// open distance: the action used to stretch to the whole row); the action is
// drawn by `SwipeRevealedAction`, above the swipeable, clipped to the
// uncovered strip. One tap per reveal: quick repeated taps open the flow once.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useSharedValue } from 'react-native-reanimated';

import { AppText } from './AppText';
import { SWIPE_ACTION_WIDTH, SWIPE_ACTIVATION_DISTANCE, SWIPE_HINT_OFFSET } from './swipe-to-delete';
import { SwipeRevealedAction, SwipeRevealSpacer, useSwipeTapGuard } from './SwipeRevealedAction';
import { semanticColors, spacing } from './theme';
import { useSwipeHintPeek } from './useSwipeHintPeek';

/**
 * Captures, once per screen instance, the row that plays the peek: the first
 * eligible row present when the screen mounts. Rows added later never replay it.
 */
export function useSwipeActionHintTarget(firstKey: string | undefined): string | undefined {
  const [target] = useState(firstKey);
  return target;
}

export { SWIPE_ACTION_WIDTH };

interface SwipeActionRowProps {
  /** Visible label of the revealed action, also the accessibility action label. */
  readonly actionLabel: string;
  /** Spoken name of the same action for VoiceOver / TalkBack (defaults to the label). */
  readonly accessibilityActionLabel?: string;
  readonly actionIcon: SymbolViewProps['name'];
  /** Opens the dedicated flow. Never an operation by itself. */
  readonly onAction: () => void;
  readonly hint?: boolean;
  /** Opaque background of the swiped content. */
  readonly surfaceColor: string;
  readonly testID: string;
  readonly actionTestID: string;
}

/** Leading inset of the grip: it sits in the row's own left padding, clear of its content. */
export const SWIPE_AFFORDANCE_INSET = 5;

export function SwipeActionRow({
  children,
  actionLabel,
  accessibilityActionLabel,
  actionIcon,
  onAction,
  hint = false,
  surfaceColor,
  testID,
  actionTestID,
}: PropsWithChildren<SwipeActionRowProps>) {
  const swipeable = useRef<SwipeableMethods>(null);
  const { hintVisible, peekStyle, cancelHint } = useSwipeHintPeek(hint);

  // The swipeable's live translation, mirrored for the revealed action layer.
  const revealed = useSharedValue(0);
  const swipeGuard = useSwipeTapGuard();
  // One action per reveal: a second quick tap while the row closes is ignored;
  // the next reveal (onSwipeableWillOpen) arms it again.
  const actionTaken = useRef(false);

  const runAction = () => {
    if (actionTaken.current) return;
    actionTaken.current = true;
    swipeable.current?.close();
    onAction();
  };

  return (
    <View
      accessibilityActions={[{ name: 'swipeAction', label: accessibilityActionLabel ?? actionLabel }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'swipeAction') onAction();
      }}
      onTouchStart={cancelHint}
      style={styles.row}
      testID={`${testID}-container`}
    >
      {hintVisible && (
        <View pointerEvents="none" style={styles.hintSurface} testID={`${testID}-hint`}>
          <SymbolView name={actionIcon} size={18} tintColor={semanticColors.accent} />
        </View>
      )}
      <Animated.View style={peekStyle}>
        <ReanimatedSwipeable
          ref={swipeable}
          childrenContainerStyle={{ backgroundColor: surfaceColor }}
          dragOffsetFromLeftEdge={SWIPE_ACTIVATION_DISTANCE}
          leftThreshold={SWIPE_ACTION_WIDTH / 2}
          onSwipeableWillOpen={() => {
            actionTaken.current = false;
          }}
          overshootLeft={false}
          renderLeftActions={(_progress, translation) => (
            <SwipeRevealSpacer revealed={revealed} translation={translation} width={SWIPE_ACTION_WIDTH} />
          )}
          testID={testID}
        >
          <View {...swipeGuard}>
            {children}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={styles.affordance}
              testID={`${testID}-affordance`}
            />
          </View>
        </ReanimatedSwipeable>
      </Animated.View>
      <SwipeRevealedAction revealed={revealed} testID={`${testID}-revealed`} width={SWIPE_ACTION_WIDTH}>
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={runAction}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          testID={actionTestID}
        >
          <SymbolView name={actionIcon} size={18} tintColor={semanticColors.accent} />
          <AppText numberOfLines={1} style={styles.actionLabel} variant="chip">
            {actionLabel}
          </AppText>
        </Pressable>
      </SwipeRevealedAction>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { overflow: 'hidden' },
  // Exactly the revealed strip, the action glyph centred in it.
  hintSurface: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: SWIPE_HINT_OFFSET,
  },
  action: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    width: SWIPE_ACTION_WIDTH,
  },
  actionPressed: { opacity: 0.7 },
  // The persistent cue: a 3 × 22 pt accent grip at 35 %, vertically centred on the leading edge.
  affordance: {
    backgroundColor: semanticColors.accent,
    borderRadius: 2,
    height: 22,
    left: SWIPE_AFFORDANCE_INSET,
    marginTop: -11,
    opacity: 0.35,
    position: 'absolute',
    top: '50%',
    width: 3,
  },
  actionLabel: { color: semanticColors.accent },
});
