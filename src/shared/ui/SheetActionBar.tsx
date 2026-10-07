// BeautIzzy — SheetActionBar
//
// The ONE fixed action area of BeautIzzy sheets: no divider and no fill of its own
// (it never overlays the body), so the body, the actions and the bottom safe
// area read as ONE continuous sheet material; platform gutter, one canonical breathing
// room below the actions, and no bottom safe-area handling of its own (the
// sheet shell — BottomSheet or SheetScreen — already clears the home
// indicator, and drops that inset while the keyboard is up). Buttons are laid
// out by the caller: a single stretched primary, or a row.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gutter, spacing } from './theme';

interface SheetActionBarProps {
  readonly children: ReactNode;
  /** `row` places actions side by side; `column` stacks them. */
  readonly direction?: 'row' | 'column';
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function SheetActionBar({ children, direction = 'column', style, testID }: SheetActionBarProps) {
  return (
    <View style={[styles.bar, direction === 'row' && styles.row, style]} testID={testID}>
      {children}
    </View>
  );
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  bar: {
    flexShrink: 0,
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  row: { flexDirection: 'row' },
});
