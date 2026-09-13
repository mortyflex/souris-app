// Souris — SheetScreen
//
// The shell of a native form-sheet ROUTE (Expo Router `presentation:
// 'formSheet'`): the same white surface, grabber, bottom safe area and
// keyboard strategy as the shared BottomSheet, so a workflow presented as a
// route (Appointment creation/editing, Product and Service editors, Sale
// creation, Appointment details) reads exactly like a drawer presented as a
// Modal. Radius, scrim and gesture policy of the native sheet are configured
// once in `src/app/(app)/_layout.tsx` (`sheetRouteOptions`).
//
// `fit="fill"` occupies the whole detent (workflows with long scrolling
// bodies); `fit="content"` sizes the screen to its content (read-first
// details) and caps it at the canonical detent so a long body still scrolls.

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SheetGrabber } from './BottomSheet';
import { semanticColors, sheet } from './theme';

interface SheetScreenProps {
  readonly children: ReactNode;
  readonly fit?: 'fill' | 'content';
  /** Lifts fixed actions above the keyboard (forms and text entry). */
  readonly keyboardAvoiding?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function SheetScreen({
  children,
  fit = 'fill',
  keyboardAvoiding = false,
  style,
  testID,
}: SheetScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  const Body = keyboardAvoiding ? KeyboardAvoidingView : View;

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.root,
        fit === 'fill' ? styles.fill : { maxHeight: windowHeight * sheet.detent },
        style,
      ]}
      testID={testID}
    >
      <SheetGrabber />
      <Body
        behavior={keyboardAvoiding && Platform.OS === 'ios' ? 'padding' : undefined}
        style={fit === 'fill' ? styles.fill : styles.shrink}
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: semanticColors.surfaceElevated },
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
});
