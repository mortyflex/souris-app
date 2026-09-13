// Souris — Screen
//
// Minimal shared screen wrapper.
//
// It exists only to remove the layout boilerplate every primary screen
// would otherwise repeat:
//   - approved application background;
//   - top safe-area handling (notch / status bar);
//   - an optional full-bleed `header` slot (MainScreenHeader) rendered after
//     the safe area and before the gutter, so its watermark anchors to the
//     title block;
//   - platform horizontal gutter (20 iOS / 16 Android) for the content.
//
// Deliberately out of scope: scrolling, keyboard behavior, loading and error
// states. Screens own those concerns.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, gutter, spacing } from './theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

interface ScreenProps extends ViewProps {
  readonly header?: ReactNode;
}

export function Screen({ header, children, style, ...rest }: ScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {header}
      <View
        style={[
          styles.content,
          header === undefined && styles.contentWithoutHeader,
          { paddingHorizontal: horizontalGutter },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: { flex: 1 },
  contentWithoutHeader: { paddingTop: spacing.md },
});
