// Souris — MainScreenHeader
//
// The ONE header composition of the main tabs (reference: Produits):
//
//     Produits                        [watermark, cropped by the right edge]
//
// A large screen title on the platform gutter, an optional count beside it
// (Clientes  622 — white figures in a small soft-violet pill), an optional
// contextual
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
import { appointmentPastels, gutter, radii, semanticColors, spacing } from './theme';

interface MainScreenHeaderProps {
  readonly title: string;
  /** Total shown in a small pill beside the title; the caller owns what is counted. */
  readonly count?: number;
  /** What the count means for screen readers (« 622 clientes actives »). */
  readonly countAccessibilityLabel?: string;
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
  count,
  countAccessibilityLabel,
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
        {count === undefined ? (
          <AppText accessibilityRole="header" style={styles.title} variant="screenTitle">
            {title}
          </AppText>
        ) : (
          <View style={styles.titleRow}>
            <AppText accessibilityRole="header" variant="screenTitle">
              {title}
            </AppText>
            <View style={styles.countPill}>
              <AppText
                accessibilityLabel={countAccessibilityLabel}
                style={styles.count}
                testID={testID ? `${testID}-count` : 'screen-title-count'}
                variant="chip"
              >
                {count}
              </AppText>
            </View>
          </View>
        )}
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
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: horizontalGutter,
  },
  // Same geometry as the SectionHeader count chip. The soft violet is the
  // lightest approved one that keeps white figures readable (4.9:1).
  countPill: {
    alignItems: 'center',
    backgroundColor: appointmentPastels.lilac.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 28,
    paddingHorizontal: spacing.sm,
  },
  count: { color: semanticColors.onAccent, fontVariant: ['tabular-nums'] },
  content: { paddingHorizontal: horizontalGutter },
});
