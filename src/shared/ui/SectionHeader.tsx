import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './AppText';
import { radii, semanticColors, spacing } from './theme';

interface SectionHeaderProps {
  readonly title: string;
  readonly count?: number;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

interface SectionCountChipProps {
  readonly count: number;
  /** Identifies the count text. */
  readonly testID?: string;
}

/**
 * The section count pill on its own, for a header that carries more than
 * one figure (Caisse: « Encaissements [n] · Clients [n] »). Same geometry
 * and colours as the built-in count.
 */
export function SectionCountChip({ count, testID }: SectionCountChipProps) {
  return (
    <View style={styles.countChip}>
      <AppText variant="chip" style={styles.countText} testID={testID}>
        {count}
      </AppText>
    </View>
  );
}

export function SectionHeader({ title, count, children, style, testID }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <AppText variant="sectionTitle" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.trailing}>
        {count !== undefined && (
          <SectionCountChip
            count={count}
            testID={testID === undefined ? undefined : `${testID}-count`}
          />
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: { color: semanticColors.foreground, flexShrink: 1 },
  trailing: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  countChip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 28,
    paddingHorizontal: spacing.sm,
  },
  countText: { color: semanticColors.accent, fontVariant: ['tabular-nums'] },
});
