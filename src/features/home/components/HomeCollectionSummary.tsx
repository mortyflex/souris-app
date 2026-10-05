// Souris — Accueil « Encaissements du jour »
//
// The secondary money line of Accueil: what today's Appointments have already
// brought in and what is still to collect, side by side in ONE compact card.
// Deliberately lighter than the two primary figures: no glyph, small values.
// Both amounts are the domain day summary's, worded here. The WHOLE card is
// one button — an accent chevron at its right edge, centred on the whole card,
// says so — and only reports:
// the caller opens the existing Caisse. One element for assistive technology,
// which hears both amounts and where the card leads.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeCollectionSummaryProps {
  /** `0 €` */
  readonly collected: string;
  /** `100 €` */
  readonly remaining: string;
  readonly onPress: () => void;
}

export function HomeCollectionSummary({ collected, remaining, onPress }: HomeCollectionSummaryProps) {
  return (
    <Pressable
      accessibilityHint="Ouvre la Caisse"
      accessibilityLabel={`Encaissements du jour, déjà encaissé ${collected}, reste à encaisser ${remaining}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID="home-collection-summary"
    >
      <View style={styles.content}>
        <AppText variant="metadata" style={styles.title}>
          Encaissements du jour
        </AppText>
        <View style={styles.figures}>
          <Figure label="encaissé" testID="home-stat-collected" value={collected} />
          <View style={styles.divider} />
          <Figure label="restant" testID="home-stat-remaining" value={remaining} />
        </View>
      </View>
      <View testID="home-collection-chevron">
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={18}
          tintColor={semanticColors.accent}
        />
      </View>
    </Pressable>
  );
}

function Figure({
  value,
  label,
  testID,
}: {
  readonly value: string;
  readonly label: string;
  readonly testID: string;
}) {
  return (
    <View style={styles.figure}>
      <AppText variant="control" numberOfLines={1} style={styles.value} testID={testID}>
        {value}
      </AppText>
      <AppText variant="metadata" numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    // The chevron is centred on the WHOLE card, not on its title line.
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  cardPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  title: { color: foregroundSoft },
  figures: { alignItems: 'center', flexDirection: 'row', gap: spacing.base },
  figure: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  divider: {
    alignSelf: 'stretch',
    backgroundColor: semanticColors.borderSubtle,
    width: StyleSheet.hairlineWidth,
  },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  label: { color: foregroundSoft, flexShrink: 1 },
});
