// BeautIzzy — ReceiptPrinter
//
// The signature presentation of the BeautIzzy receipts — « Résumé du jour » and
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
// The paper keeps its NATURAL height. Inside the clip it sits in ONE vertical
// scroll view: on a short screen (iPhone SE) or a long receipt the whole paper
// — header, lines, totals and BeautIzzy footer — scrolls as one document, back
// up into the slot, and the room of the actions is padded under it so its torn
// bottom edge always comes clear of them. When the paper fits, nothing scrolls
// and nothing bounces.
//
// Motion is Reanimated on the UI thread: `presence` (scrim, capsule, « Fermer »,
// closing), `feed` (the travel) and `settle` (one tiny give at the end). The
// only JS work is starting them and one timer that unmounts the Modal after the
// closing transition. ONE soft haptic when the paper starts feeding.
//
// Reduced motion: no travel and no settle — the receipt is in place at once
// and the whole presentation simply fades. Everything stays available.
//
// Dismissal: the « Fermer » close button under the paper (spoken « Fermer »),
// a tap on the dimmed page, the hardware back button, the accessibility escape
// gesture.
//
// The actions under the paper are ONE centred row of the same compact icon
// buttons for every receipt (`GlassIconButton`, floating glass, accent
// glyphs), each with its spoken label: « Fermer » (close glyph) alone for
// « Résumé du jour », followed by the receipt's own `actions` for « Tops &
// tendances » (« Enregistrer », « Partager »). Optional too: a short notice
// line above them, and an `offstage` slot rendered outside the screen for
// content that must be mounted but never seen (an image export surface).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
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

import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import { GlassIconButton, glassIcons } from './GlassIconButton';
import { GlassSurface } from './GlassSurface';
import {
  easing,
  mint,
  nativeShadows,
  radii,
  receiptPaper,
  receiptPrint,
  receiptPrinter,
  scrim,
  semanticColors,
} from './theme';

/** The paper is as tall as its content: the printer scrolls it, it never bounds it. */
export interface ReceiptPaperFrame {
  readonly width: number;
}

/** An icon button after « Fermer ». Icon-only: its label is spoken, never shown. */
export interface ReceiptPrinterAction {
  readonly icon: PlatformSymbolName;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  /** Working: a small spinner in place of the glyph, and the button ignores presses. */
  readonly busy?: boolean;
  /** Ignores presses (another action is working). */
  readonly disabled?: boolean;
  readonly testID?: string;
}

interface ReceiptPrinterProps {
  readonly visible: boolean;
  /** Every dismissal request: « Fermer », dimmed page, hardware back, escape. */
  readonly onClose: () => void;
  readonly backdropLabel: string;
  readonly renderReceipt: (frame: ReceiptPaperFrame) => ReactNode;
  /** Capsules after « Fermer », in order. */
  readonly actions?: readonly ReceiptPrinterAction[];
  /** One short line above the actions (a confirmation, or an error to retry). */
  readonly actionNotice?: string;
  /** Mounted outside the screen while the receipt is presented: never seen, never announced. */
  readonly offstage?: ReactNode;
  readonly testID?: string;
}

// Paper leaves a printer at a steady pace: a soft start, a long even travel,
// a gentle arrival.
const feedEasing = Easing.bezier(0.42, 0, 0.3, 1);
const presenceEasing = Easing.bezier(...easing.out);
/** Small drop travelled by the capsule while it appears, and by the paper while it leaves (pt). */
const PRESENCE_TRAVEL = 8;

// Known before any Modal mounts (BeautIzzy is portrait-locked): a safe-area view
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
/** Room taken above the actions by a notice line. */
const NOTICE_ROOM = 44;

export function ReceiptPrinter({
  visible,
  onClose,
  backdropLabel,
  renderReceipt,
  actions = [],
  actionNotice,
  offstage,
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
  const actionsHeight = closeAreaHeight + (actionNotice !== undefined ? NOTICE_ROOM : 0);

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
          <ScrollView
            alwaysBounceVertical={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: actionsHeight }]}
            showsVerticalScrollIndicator={false}
            testID={`${testID}-scroll`}
          >
            {/* The dimmed page around the paper still dismisses; the labelled backdrop above is the spoken one. */}
            <Pressable
              accessible={false}
              onPress={onClose}
              style={StyleSheet.absoluteFill}
              testID={`${testID}-scroll-backdrop`}
            />
            <Animated.View
              onLayout={onPaperLayout}
              style={[styles.paper, { marginTop: restOffset, width: paperWidth }, paperStyle]}
              testID={`${testID}-paper`}
            >
              {renderReceipt({ width: paperWidth })}
            </Animated.View>
          </ScrollView>
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
          {actionNotice !== undefined && (
            <View style={styles.notice}>
              <GlassSurface floating shape={styles.capsuleShape} />
              <AppText
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={styles.noticeText}
                testID={`${testID}-notice`}
                variant="metadata"
              >
                {actionNotice}
              </AppText>
            </View>
          )}
          <View style={styles.actions}>
            <GlassIconButton
              accessibilityLabel="Fermer"
              floating
              icon={glassIcons.close}
              onPress={onClose}
              testID={`${testID}-close`}
              tintColor={semanticColors.accent}
            />
            {actions.map((action) => (
              <GlassIconButton
                accessibilityLabel={action.accessibilityLabel}
                busy={action.busy}
                disabled={action.disabled}
                floating
                icon={action.icon}
                key={action.accessibilityLabel}
                onPress={action.onPress}
                testID={action.testID}
                tintColor={semanticColors.accent}
              />
            ))}
          </View>
        </Animated.View>

        {offstage !== undefined && (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[styles.offstage, { left: windowWidth * 2 }]}
            testID={`${testID}-offstage`}
          >
            {offstage}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: scrim },
  clip: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0 },
  // At least the height of the clip, so the dimmed page stays tappable under a short paper.
  scrollContent: { flexGrow: 1 },
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
  // 44 pt circles, evenly apart: compact under the paper, never a toolbar.
  actions: { flexDirection: 'row', gap: 24 },
  notice: {
    borderRadius: radii.pill,
    marginBottom: 12,
    marginHorizontal: 24,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  noticeText: { color: semanticColors.foreground, textAlign: 'center' },
  // Outside the window, to the right: laid out and drawn, never on screen.
  offstage: { position: 'absolute', top: 0 },
});
