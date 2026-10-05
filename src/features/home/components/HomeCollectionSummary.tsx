// Souris — Accueil « Encaissements du jour »
//
// The secondary money line of Accueil: what today's Appointments have already
// brought in and what is still to collect, side by side in ONE compact card.
// Deliberately lighter than the two primary figures: no glyph, small values.
// Display only — both amounts are the domain day summary's, worded here.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeCollectionSummaryProps {
  /** `0 €` */
  readonly collected: string;
  /** `100 €` */
  readonly remaining: string;
}

export function HomeCollectionSummary({ collected, remaining }: HomeCollectionSummaryProps) {
  return (
    <View style={styles.card} testID="home-collection-summary">
      <AppText variant="metadata" style={styles.title}>
        Encaissements du jour
      </AppText>
      <View style={styles.figures}>
        <Figure
          accessibilityLabel={`Déjà encaissé, ${collected}`}
          label="encaissé"
          testID="home-stat-collected"
          value={collected}
        />
        <View style={styles.divider} />
        <Figure
          accessibilityLabel={`Reste à encaisser, ${remaining}`}
          label="restant"
          testID="home-stat-remaining"
          value={remaining}
        />
      </View>
    </View>
  );
}

function Figure({
  value,
  label,
  accessibilityLabel,
  testID,
}: {
  readonly value: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={styles.figure}>
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
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
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
