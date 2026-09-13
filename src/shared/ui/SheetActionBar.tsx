// Souris — SheetActionBar
//
// The ONE fixed action area of Souris sheets: separated from the scrolling
// body by a hairline, white surface, platform gutter, one canonical breathing
// room below the actions, and no bottom safe-area handling of its own (the
// sheet shell — BottomSheet or SheetScreen — already clears the home
// indicator, and drops that inset while the keyboard is up). Buttons are laid
// out by the caller: a single stretched primary, or a row.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gutter, semanticColors, spacing } from './theme';

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
    backgroundColor: semanticColors.surfaceElevated,
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.md,
  },
  row: { flexDirection: 'row' },
});
