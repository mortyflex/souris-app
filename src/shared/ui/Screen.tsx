// Souris — Screen
//
// Minimal shared screen wrapper.
//
// It exists only to remove the layout boilerplate every primary screen
// would otherwise repeat:
//   - approved application background;
//   - top safe-area handling (notch / status bar);
//   - platform horizontal gutter (20 iOS / 16 Android);
//   - common top spacing before the screen header.
//
// Deliberately out of scope: scrolling, headers, keyboard behavior,
// loading and error states. Future screens own those concerns.

import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, gutter, spacing } from './theme';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.content, { paddingHorizontal: horizontalGutter }, style]} {...rest}>
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
  content: {
    flex: 1,
    paddingTop: spacing.md,
  },
});
