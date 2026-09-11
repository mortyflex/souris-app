// Souris — BottomSheet
//
// Shared bottom-anchored sheet presentation used by every small drawer
// (confirmations, pickers, action lists, forms). It owns the pieces that must
// look identical everywhere and is deliberately content-agnostic:
//
// - exactly ONE navy scrim (theme `scrim`), which fades in/out natively with
//   the Modal — it never slides, so no translucent panel travels over the
//   screen;
// - the sheet surface (rounded top, elevated background, bottom safe area,
//   grabber) which slides up from the bottom edge while the scrim fades;
// - outside-tap dismissal, hardware back, and `onDismissed`, which fires once
//   the Modal is fully gone (native iOS callback; immediate elsewhere) so a
//   caller can chain another presentation without stacking modals.
//
// Motion uses the core Animated API on the native driver (transform only):
// this is a mount-only, non-interactive transition, and keeping the shared
// primitive free of worklets keeps every consumer screen test simple.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { duration, easing, gutter, radii, scrim, semanticColors, spacing } from './theme';

interface BottomSheetProps {
  readonly visible: boolean;
  /** Outside tap and hardware back. */
  readonly onClose: () => void;
  /** Fired once the Modal is completely gone; safe to present another Modal. */
  readonly onDismissed?: () => void;
  readonly onShow?: () => void;
  /** Accessibility label of the outside-tap area. */
  readonly backdropLabel: string;
  readonly dismissOnBackdropPress?: boolean;
  readonly keyboardAvoiding?: boolean;
  /** Fixed sheet height (e.g. '88%'); otherwise the sheet fits its content. */
  readonly height?: DimensionValue;
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
  keyboardAvoiding = false,
  height,
  contentStyle,
  testID,
  children,
}: BottomSheetProps) {
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(windowHeight);
  const [progress] = useState(() => new Animated.Value(1));
  const wasVisible = useRef(visible);

  useEffect(() => {
    if (!visible) return;
    progress.setValue(1);
    const slide = Animated.timing(progress, {
      duration: reduceMotion ? 0 : duration.panel,
      easing: slideEasing,
      toValue: 0,
      useNativeDriver: true,
    });
    slide.start();
    return () => slide.stop();
  }, [visible, reduceMotion, progress]);

  // iOS reports the real dismissal through the Modal; other platforms hide
  // synchronously, so the callback runs as soon as `visible` drops.
  useEffect(() => {
    if (wasVisible.current && !visible && Platform.OS !== 'ios') onDismissed?.();
    wasVisible.current = visible;
  }, [visible, onDismissed]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sheetHeight],
  });
  const Anchor = keyboardAvoiding ? KeyboardAvoidingView : View;

  return (
    <Modal
      animationType="fade"
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
      onRequestClose={onClose}
      onShow={onShow}
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={backdropLabel}
          accessibilityRole="button"
          disabled={!dismissOnBackdropPress}
          onPress={onClose}
          style={styles.scrim}
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
            style={[styles.sheet, height !== undefined && { height }, { transform: [{ translateY }] }]}
          >
            <SafeAreaView
              accessibilityViewIsModal
              edges={['bottom']}
              style={[styles.content, contentStyle]}
              testID={testID}
            >
              <View style={styles.grabber} />
              {children}
            </SafeAreaView>
          </Animated.View>
        </Anchor>
      </View>
    </Modal>
  );
}

function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
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
    maxHeight: '100%',
    overflow: 'hidden',
  },
  content: {
    flexShrink: 1,
    paddingHorizontal: horizontalGutter,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.sm,
    width: 40,
  },
});
