// Souris — Accueil primary figure
//
// One of the two strong figures of Accueil: an accent glyph, the VALUE large
// and dominant, a short label under it. The two cards are a pair: the same
// value hierarchy whatever the figure. The value steps down by its length
// (never measured, never truncated) so a long amount still fits the card.
// Display only — the caller owns what the value means.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeKpiCardProps {
  readonly icon: SymbolViewProps['name'];
  readonly value: string;
  readonly label: string;
  /** The full spoken name of the figure (« Rendez-vous aujourd’hui »). */
  readonly accessibilityLabel: string;
  /** Identifies the value text. */
  readonly testID: string;
}

/** `2`, `100 €`, `1 240 €` at full size; longer amounts one or two steps down. */
function valueSize(value: string): { readonly fontSize: number; readonly lineHeight: number } {
  if (value.length <= 7) return { fontSize: 30, lineHeight: 36 };
  if (value.length <= 9) return { fontSize: 26, lineHeight: 32 };
  return { fontSize: 22, lineHeight: 28 };
}

export function HomeKpiCard({ icon, value, label, accessibilityLabel, testID }: HomeKpiCardProps) {
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}, ${value}`} style={styles.card}>
      <View style={styles.glyph}>
        <SymbolView name={icon} size={18} tintColor={semanticColors.accent} />
      </View>
      <View>
        <AppText
          numberOfLines={1}
          variant="screenTitle"
          style={[styles.value, valueSize(value)]}
          testID={testID}
        >
          {value}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.label}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.base,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  label: { color: foregroundSoft },
});
