// Souris — BottomSheet
//
// The ONE canonical bottom-anchored drawer (docs/design/DESIGN_OVERRIDES.md
// §16). Every small drawer — confirmations, pickers, action lists, forms —
// uses this primitive; native form-sheet routes reuse the same shell pieces
// through SheetScreen. It owns everything that must look and behave
// identically everywhere and stays deliberately content-agnostic:
//
// - exactly ONE navy scrim (theme `scrim`) that fades in with the sheet and
//   fades out while the sheet slides down — it never slides itself;
// - the white surface (rounded top corners, bottom safe area, grabber);
// - the open transition (slide up + scrim fade in) AND the close transition
//   (slide down + scrim fade out, THEN unmount and `onDismissed`) — closing
//   never makes the surface disappear instantly;
// - the dismissal policy: `dismissOnBackdropPress`, `dismissOnPanDown` and
//   `dismissOnHardwareBack` are explicit options. Pan-to-dismiss lives ONLY
//   on the grabber/header zone, so scrolling content never competes with the
//   sheet gesture;
// - optional canonical header (`SheetHeader`), scrollable body, fixed action
//   area (`SheetActionBar`) and keyboard-safe layout (the bottom safe-area
//   inset is dropped while the keyboard is up, so no double inset).
//
// Motion uses the core Animated API on the native driver (transform +
// opacity only) and a PanResponder for the grabber drag: this keeps the shared
// primitive free of worklets, so every consumer screen test stays simple.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { duration, easing, gutter, radii, scrim, semanticColors, sheet, spacing } from './theme';
import { useReduceMotion } from './useReduceMotion';

interface BottomSheetProps {
  readonly visible: boolean;
  /** Every dismissal request: backdrop, hardware back, pan-down, explicit close. */
  readonly onClose: () => void;
  /** Fired once the close transition ran and the Modal is completely gone. */
  readonly onDismissed?: () => void;
  readonly onShow?: () => void;
  /** Accessibility label of the outside-tap area. */
  readonly backdropLabel: string;
  readonly dismissOnBackdropPress?: boolean;
  /** Drag down on the grabber/header zone. Disable for long lists and forms. */
  readonly dismissOnPanDown?: boolean;
  readonly dismissOnHardwareBack?: boolean;
  /** Lifts the sheet above the keyboard (forms and text entry). */
  readonly keyboardAvoiding?: boolean;
  /** Fixed sheet height (e.g. '88%'); otherwise the sheet fits its content. */
  readonly height?: DimensionValue;
  /** Canonical header, rendered inside the drag zone. */
  readonly header?: ReactNode;
  /** Wraps the body in a keyboard-safe ScrollView. */
  readonly scrollable?: boolean;
  /** Fixed action area anchored below the body (use SheetActionBar). */
  readonly footer?: ReactNode;
  /** Horizontal gutter around the body; disable when children pad themselves. */
  readonly padded?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly children: ReactNode;
}

const slideEasing = Easing.bezier(...easing.out);

export function BottomSheet({
  visible,
  onClose,
  onDismissed,
  onShow,
  backdropLabel,
  dismissOnBackdropPress = true,
  dismissOnPanDown = true,
  dismissOnHardwareBack = true,
  keyboardAvoiding = false,
  height,
  header,
  scrollable = false,
  footer,
  padded = true,
  contentStyle,
  testID,
  children,
}: BottomSheetProps) {
  const reduceMotion = useReduceMotion();
  const keyboardVisible = useKeyboardVisible(keyboardAvoiding);
  const { height: windowHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(windowHeight);
  // The Modal stays mounted while the sheet slides down; `presented` drops
  // only once the close transition has finished.
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);
  const [progress] = useState(() => new Animated.Value(1));
  const transition = useRef<Animated.CompositeAnimation | null>(null);

  // Open: slide up while the scrim fades in.
  // Close: slide down while the scrim fades out, THEN unmount the Modal.
  useEffect(() => {
    if (!presented) return;
    transition.current?.stop();
    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : duration.panel,
      easing: slideEasing,
      toValue: visible ? 0 : 1,
      useNativeDriver: true,
    });
    transition.current = animation;
    animation.start(({ finished }) => {
      if (finished && !visible) setPresented(false);
    });
    return () => animation.stop();
  }, [visible, presented, reduceMotion, progress]);

  // iOS reports the real dismissal through the Modal; other platforms hide
  // synchronously, so the callback runs as soon as the Modal unmounts.
  const wasPresented = useRef(presented);
  useEffect(() => {
    if (wasPresented.current && !presented && Platform.OS !== 'ios') onDismissed?.();
    wasPresented.current = presented;
  }, [presented, onDismissed]);

  // Drag on the grabber/header zone only: the body keeps scrolling freely.
  const panResponder = useMemo(() => {
    const settleBack = () =>
      Animated.timing(progress, {
        duration: duration.state,
        easing: slideEasing,
        toValue: 0,
        useNativeDriver: true,
      }).start();

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        dismissOnPanDown && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        // Take over the value from any running open/close transition.
        progress.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        progress.setValue(Math.min(Math.max(gesture.dy, 0) / Math.max(sheetHeight, 1), 1));
      },
      onPanResponderRelease: (_event, gesture) => {
        const dismiss =
          gesture.dy > sheet.dismissThreshold || (gesture.dy > 24 && gesture.vy > 0.8);
        if (dismiss) {
          onClose();
          return;
        }
        settleBack();
      },
      onPanResponderTerminate: settleBack,
    });
  }, [dismissOnPanDown, onClose, progress, sheetHeight]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sheetHeight],
  });
  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const Anchor = keyboardAvoiding ? KeyboardAvoidingView : View;
  const bodyStyle = [padded && styles.padded, contentStyle];

  return (
    <Modal
      animationType="none"
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
      onRequestClose={dismissOnHardwareBack ? onClose : undefined}
      onShow={onShow}
      transparent
      visible={presented}
    >
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: scrimOpacity }]} />
        <Pressable
          accessibilityLabel={backdropLabel}
          accessibilityRole="button"
          disabled={!dismissOnBackdropPress}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="bottom-sheet-scrim"
        />
        <Anchor
          behavior={keyboardAvoiding && Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.anchor}
        >
          <Animated.View
            onLayout={(event) => {
              const measured = Math.ceil(event.nativeEvent.layout.height);
              setSheetHeight((current) => (current === measured ? current : measured));
            }}
            style={[
              styles.sheet,
              { maxHeight: windowHeight * sheet.detent },
              height !== undefined && { height },
              { transform: [{ translateY }] },
            ]}
          >
            <SafeAreaView
              accessibilityViewIsModal
              edges={keyboardVisible ? [] : ['bottom']}
              style={styles.content}
              testID={testID}
            >
              <View
                accessible={false}
                style={styles.dragZone}
                testID="bottom-sheet-drag-zone"
                {...panResponder.panHandlers}
              >
                <SheetGrabber />
                {header && <View style={styles.padded}>{header}</View>}
              </View>
              {scrollable ? (
                <ScrollView
                  contentContainerStyle={bodyStyle}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.scroll}
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={[styles.body, bodyStyle]}>{children}</View>
              )}
              {footer}
            </SafeAreaView>
          </Animated.View>
        </Anchor>
      </View>
    </Modal>
  );
}

/** The Souris grabber: shared by the JS sheet and the native sheet screens. */
export function SheetGrabber() {
  return <View accessible={false} style={styles.grabber} />;
}

/** Tracks the software keyboard so the bottom safe-area inset is not doubled. */
function useKeyboardVisible(enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);

  return enabled && visible;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: scrim,
  },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    overflow: 'hidden',
  },
  content: { flexShrink: 1 },
  dragZone: { flexShrink: 0 },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: sheet.grabberHeight,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    width: sheet.grabberWidth,
  },
  padded: { paddingHorizontal: horizontalGutter },
  body: { flexShrink: 1 },
  scroll: { flexShrink: 1 },
});
