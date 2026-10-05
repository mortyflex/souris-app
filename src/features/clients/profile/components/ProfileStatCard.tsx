// Souris — Client Profile stat card
//
// One glanceable figure of the profile's Activité grid: a small accent glyph
// in a lavender disc, then the value in navy over a short soft label — the
// number is read first. Numbers are never violet. Display only — every value is derived by the
// profile presentation, nothing is computed here.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface ProfileStatCardProps {
  readonly icon: SymbolViewProps['name'];
  /** Short enough to never truncate in a half-width card. */
  readonly label: string;
  readonly value: string;
  /** The full spoken name of the figure, when the visible label is shortened. */
  readonly accessibilityLabel?: string;
  /** Identifies the value text. */
  readonly testID: string;
}

export function ProfileStatCard({
  icon,
  label,
  value,
  accessibilityLabel = label,
  testID,
}: ProfileStatCardProps) {
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}, ${value}`} style={styles.card}>
      <View style={styles.glyph}>
        <SymbolView name={icon} size={16} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText
          adjustsFontSizeToFit
          numberOfLines={1}
          variant="summaryValue"
          style={styles.value}
          testID={testID}
        >
          {value}
        </AppText>
        <AppText variant="metadata" numberOfLines={2} style={styles.label}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: { flex: 1, minWidth: 0 },
  label: { color: foregroundSoft },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
