// Souris — MainScreenHeader
//
// The ONE header composition of the main tabs (reference: Produits):
//
//     Produits                        [watermark, cropped by the right edge]
//
// A large screen title on the platform gutter, an optional contextual
// eyebrow above it (Agenda's date — never a duplicate of the title), optional
// trailing/children content (a view switcher, a search field), and the
// decorative watermark anchored to the TITLE BLOCK. The block is full width
// and unpadded so the watermark's right crop is identical on every screen,
// and it is rendered after the top safe area, so the status bar and the
// Dynamic Island never change the watermark's position on the page.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { ScreenWatermarkIcon, type ScreenWatermarkKind } from './ScreenWatermarkIcon';
import { gutter, semanticColors, spacing } from './theme';

interface MainScreenHeaderProps {
  readonly title: string;
  /** Contextual eyebrow (e.g. the Agenda date); never the title repeated. */
  readonly eyebrow?: string;
  readonly watermark?: ScreenWatermarkKind;
  /** Content laid out below the title, inside the gutter (switcher, search). */
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function MainScreenHeader({
  title,
  eyebrow,
  watermark,
  children,
  style,
  testID,
}: MainScreenHeaderProps) {
  return (
    <View style={[styles.header, style]} testID={testID}>
      {eyebrow && (
        <AppText variant="eyebrow" style={styles.eyebrow}>
          {eyebrow}
        </AppText>
      )}
      <View style={styles.titleBlock}>
        {watermark && <ScreenWatermarkIcon kind={watermark} />}
        <AppText accessibilityRole="header" style={styles.title} variant="screenTitle">
          {title}
        </AppText>
        {children && <View style={styles.content}>{children}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.md },
  eyebrow: { color: semanticColors.foregroundSoft, paddingBottom: spacing.xs, paddingHorizontal: horizontalGutter },
  // Full width and unpadded: the watermark anchors against this block.
  titleBlock: { position: 'relative' },
  title: { paddingHorizontal: horizontalGutter },
  content: { paddingHorizontal: horizontalGutter },
});
