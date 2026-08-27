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
}

export function SectionHeader({ title, count, children, style }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <AppText variant="sectionTitle" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.trailing}>
        {count !== undefined && (
          <View style={styles.countChip}>
            <AppText variant="chip" style={styles.countText}>
              {count}
            </AppText>
          </View>
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
