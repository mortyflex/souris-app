// Souris — ReceiptPrinter
//
// The signature presentation of the Souris receipts — « Résumé du jour » and
// « Tops & tendances » (DESIGN_OVERRIDES.md §25, §34):
// the Agenda dims, a small light-glass printer capsule lands under the top safe
// area, and the receipt feeds DOWN out of its groove like paper being printed,
// then settles. An app-owned element: on an iPhone with a Dynamic Island the
// capsule sits right below it, and nothing depends on the island being there.
//
// How the paper "comes out": the receipt is laid out at its resting place
// inside a clip whose top edge is the middle of the groove, and is translated
// up by its own height. Feeding it is ONE translation back to rest, so the
// paper is only ever visible below the slot. The capsule is drawn above the
// clip. No line of the receipt animates on its own: the paper is the object.
//
// Motion is Reanimated on the UI thread: `presence` (scrim, capsule, « Fermer »,
// closing), `feed` (the travel) and `settle` (one tiny give at the end). The
// only JS work is starting them and one timer that unmounts the Modal after the
// closing transition. ONE soft haptic when the paper starts feeding.
//
// Reduced motion: no travel and no settle — the receipt is in place at once
// and the whole presentation simply fades. Everything stays available.
//
// Dismissal: the worded « Fermer » capsule under the paper, a tap on the dimmed
// page, the hardware back button, the accessibility escape gesture.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import { GlassSurface } from './GlassSurface';
import {
  easing,
  interaction,
  mint,
  nativeShadows,
  radii,
  receiptPaper,
  receiptPrint,
  receiptPrinter,
  scrim,
  semanticColors,
} from './theme';

export interface ReceiptPaperFrame {
  readonly width: number;
  /** The paper never grows past this: its own list scrolls instead. */
  readonly maxHeight: number;
}

interface ReceiptPrinterProps {
  readonly visible: boolean;
  /** Every dismissal request: « Fermer », dimmed page, hardware back, escape. */
  readonly onClose: () => void;
  readonly backdropLabel: string;
  readonly renderReceipt: (frame: ReceiptPaperFrame) => ReactNode;
  readonly testID?: string;
}

// Paper leaves a printer at a steady pace: a soft start, a long even travel,
// a gentle arrival.
const feedEasing = Easing.bezier(0.42, 0, 0.3, 1);
const presenceEasing = Easing.bezier(...easing.out);
/** Small drop travelled by the capsule while it appears, and by the paper while it leaves (pt). */
const PRESENCE_TRAVEL = 8;

// Known before any Modal mounts (Souris is portrait-locked): a safe-area view
// mounted while a Modal is being presented may still measure 0.
const topInset = initialWindowMetrics?.insets.top ?? 0;
const bottomInset = initialWindowMetrics?.insets.bottom ?? 0;

const capsuleTop = topInset + receiptPrinter.topGap;
/** The paper appears from the middle of the groove. */
const slotLine = capsuleTop + receiptPrinter.grooveTop + receiptPrinter.grooveHeight / 2;
/** Resting distance between the slot line and the top edge of the paper. */
const restOffset = capsuleTop + receiptPrinter.capsuleHeight + receiptPrinter.restGap - slotLine;
const closeAreaHeight =
  bottomInset + receiptPrinter.closeGap * 2 + receiptPrinter.closeHeight;

export function ReceiptPrinter({
  visible,
  onClose,
  backdropLabel,
  renderReceipt,
  testID = 'receipt-printer',
}: ReceiptPrinterProps) {
  const reducedMotion = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // The Modal stays mounted while the presentation leaves.
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);

  const presence = useSharedValue(0);
  const feed = useSharedValue(0);
  const settle = useSharedValue(0);
  // Until the paper is measured it is assumed as tall as the window: hidden.
  const paperHeight = useSharedValue(windowHeight);
  const printing = useRef(false);

  useEffect(() => {
    if (!presented) return;
    if (visible) {
      presence.set(withTiming(1, { duration: receiptPrint.capsule, easing: presenceEasing }));
      return;
    }
    presence.set(withTiming(0, { duration: receiptPrint.dismiss, easing: presenceEasing }));
    const unmount = setTimeout(() => {
      printing.current = false;
      feed.set(0);
      settle.set(0);
      setPresented(false);
    }, receiptPrint.dismiss);
    return () => clearTimeout(unmount);
  }, [visible, presented, presence, feed, settle]);

  // The print starts once the paper is really laid out — its height is the
  // travel — and only once per opening, whatever later layouts report.
  const onPaperLayout = (event: LayoutChangeEvent) => {
    paperHeight.set(event.nativeEvent.layout.height);
    if (printing.current || !visible) return;
    printing.current = true;
    haptics.print();
    if (reducedMotion) {
      feed.set(1);
      return;
    }
    feed.set(
      withDelay(receiptPrint.feedDelay, withTiming(1, { duration: receiptPrint.feed, easing: feedEasing })),
    );
    settle.set(
      withDelay(
        receiptPrint.feedDelay + receiptPrint.feed,
        withSequence(
          withTiming(receiptPrinter.settleTravel, { duration: receiptPrint.settleOut }),
          withTiming(0, { duration: receiptPrint.settleBack, easing: presenceEasing }),
        ),
      ),
    );
  };

  const fadeStyle = useAnimatedStyle(() => ({ opacity: presence.get() }));
  const capsuleStyle = useAnimatedStyle(() => ({
    opacity: presence.get(),
    transform: [{ translateY: reducedMotion ? 0 : (presence.get() - 1) * PRESENCE_TRAVEL }],
  }));
  const paperStyle = useAnimatedStyle(() => {
    const hidden = (feed.get() - 1) * (paperHeight.get() + restOffset);
    const leaving = reducedMotion ? 0 : (1 - presence.get()) * PRESENCE_TRAVEL;
    return {
      opacity: presence.get(),
      transform: [{ translateY: hidden + settle.get() + leaving }],
    };
  });

  const paperWidth = Math.min(
    windowWidth - receiptPrinter.paperWindowMargin * 2,
    receiptPrinter.paperMaxWidth,
  );
  const capsuleWidth = paperWidth + receiptPrinter.capsuleOverhang * 2;
  const maxHeight = Math.max(windowHeight - slotLine - restOffset - closeAreaHeight, 0);

  // Nothing is mounted — and the receipt is not even built — while closed.
  if (!presented) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={styles.root}
        testID={testID}
      >
        <Animated.View pointerEvents="none" style={[styles.scrim, fadeStyle]} />
        <Pressable
          accessibilityLabel={backdropLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-backdrop`}
        />

        {/* Everything above the slot line is cut off: the paper only exists below it. */}
        <View pointerEvents="box-none" style={[styles.clip, { top: slotLine }]}>
          <Animated.View
            onLayout={onPaperLayout}
            style={[styles.paper, { marginTop: restOffset, width: paperWidth }, paperStyle]}
            testID={`${testID}-paper`}
          >
            {renderReceipt({ width: paperWidth, maxHeight })}
          </Animated.View>
        </View>

        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.capsule, { top: capsuleTop, width: capsuleWidth }, capsuleStyle]}
          testID={`${testID}-capsule`}
        >
          <GlassSurface floating shape={styles.capsuleShape} testID={`${testID}-capsule-glass`} />
          <View style={styles.groove} />
          <View style={styles.light} />
        </Animated.View>

        <Animated.View
          pointerEvents="box-none"
          style={[styles.closeArea, { bottom: bottomInset + receiptPrinter.closeGap }, fadeStyle]}
        >
          <Pressable
            accessibilityLabel="Fermer"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            testID={`${testID}-close`}
          >
            <GlassSurface floating shape={styles.capsuleShape} testID={`${testID}-close-glass`} />
            <AppText variant="control" style={styles.closeLabel}>
              Fermer
            </AppText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: scrim },
  clip: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0 },
  paper: { alignSelf: 'center' },
  capsule: {
    alignSelf: 'center',
    borderRadius: radii.pill,
    height: receiptPrinter.capsuleHeight,
    position: 'absolute',
    ...nativeShadows.glassFloating,
  },
  capsuleShape: { borderRadius: radii.pill },
  groove: {
    backgroundColor: receiptPaper.slot,
    borderRadius: radii.pill,
    height: receiptPrinter.grooveHeight,
    left: receiptPrinter.grooveInset,
    position: 'absolute',
    right: receiptPrinter.grooveInset,
    top: receiptPrinter.grooveTop,
  },
  light: {
    backgroundColor: mint.mint600,
    borderRadius: radii.pill,
    height: receiptPrinter.lightSize,
    position: 'absolute',
    right: receiptPrinter.grooveInset + 8,
    top: (receiptPrinter.grooveTop - receiptPrinter.lightSize) / 2 + 1,
    width: receiptPrinter.lightSize,
  },
  closeArea: { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
  close: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: receiptPrinter.closeHeight,
    justifyContent: 'center',
    minWidth: 148,
    paddingHorizontal: 28,
    ...nativeShadows.glassFloating,
  },
  closePressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  closeLabel: { color: semanticColors.accent },
});
