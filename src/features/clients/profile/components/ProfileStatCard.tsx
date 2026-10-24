// BeautIzzy — Client Profile stat card
//
// One glanceable figure of the profile's Activité grid: a small accent glyph
// in a lavender disc, then the value in navy over a short soft label — the
// number is read first. Numbers are never violet. Display only — every value is derived by the
// profile presentation, nothing is computed here.
//
// An optional `accent` draws a thin coloured outline (the glyph takes the same
// colour) without moving anything: the outline is carved out of the padding,
// so an accented card keeps the exact footprint of a plain one. The figure
// and its label never change colour.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

/** A severity outline of one card. The colour is never the only cue (see `accessibilityDescription`). */
export interface ProfileStatCardAccent {
  readonly color: string;
}

interface ProfileStatCardProps {
  readonly icon: SymbolViewProps['name'];
  /** Short enough to never truncate in a half-width card. */
  readonly label: string;
  readonly value: string;
  /** The full spoken name of the figure, when the visible label is shortened. */
  readonly accessibilityLabel?: string;
  /** Spoken after the value: what an `accent` means, so it never depends on colour alone. */
  readonly accessibilityDescription?: string;
  readonly accent?: ProfileStatCardAccent;
  /** Identifies the value text. */
  readonly testID: string;
}

const ACCENT_BORDER_WIDTH = 1.5;

export function ProfileStatCard({
  icon,
  label,
  value,
  accessibilityLabel = label,
  accessibilityDescription,
  accent,
  testID,
}: ProfileStatCardProps) {
  const spokenParts = [accessibilityLabel, value];
  if (accent && accessibilityDescription) spokenParts.push(accessibilityDescription);

  return (
    <View
      accessible
      accessibilityLabel={spokenParts.join(', ')}
      style={[styles.card, accent && [styles.accentedCard, { borderColor: accent.color }]]}
    >
      <View style={styles.glyph}>
        <SymbolView name={icon} size={16} tintColor={accent?.color ?? semanticColors.accent} />
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
  // The outline replaces part of the padding: same outer size as a plain card.
  accentedCard: {
    borderWidth: ACCENT_BORDER_WIDTH,
    padding: spacing.md - ACCENT_BORDER_WIDTH,
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
