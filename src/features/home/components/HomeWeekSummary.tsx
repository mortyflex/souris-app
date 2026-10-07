// BeautIzzy — Accueil « Cette semaine »
//
// The current Agenda week in ONE compact card: the number of appointments as
// the strong figure, then what they have brought in and what they represent.
// A secondary summary — quieter than today's pair: no glyph, one strong
// number. Display only — the three figures are the domain period summary of
// the week, the very figures of « Résumé de la semaine ».

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeWeekSummaryProps {
  /** `5 – 11 octobre 2026` */
  readonly rangeLabel: string;
  readonly appointmentCount: number;
  /** `860 €` */
  readonly collected: string;
  /** `1 120 €` */
  readonly potential: string;
}

export function HomeWeekSummary({
  rangeLabel,
  appointmentCount,
  collected,
  potential,
}: HomeWeekSummaryProps) {
  return (
    <View style={styles.card} testID="home-week-summary">
      <AppText variant="metadata" style={styles.range}>
        {rangeLabel}
      </AppText>
      <View style={styles.body}>
        <View
          accessible
          accessibilityLabel={`${appointmentCount} rendez-vous cette semaine`}
          style={styles.count}
        >
          <AppText
            numberOfLines={1}
            variant="screenTitle"
            style={styles.countValue}
            testID="home-week-appointments"
          >
            {appointmentCount}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.label}>
            rendez-vous
          </AppText>
        </View>
        <View style={styles.divider} />
        <View style={styles.amounts}>
          <Amount label="Déjà encaissé" testID="home-week-collected" value={collected} />
          <Amount label="CA potentiel" testID="home-week-potential" value={potential} />
        </View>
      </View>
    </View>
  );
}

function Amount({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label} cette semaine, ${value}`} style={styles.amount}>
      <AppText variant="metadata" numberOfLines={1} style={styles.amountLabel}>
        {label}
      </AppText>
      <AppText variant="control" numberOfLines={1} style={styles.amountValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  range: { color: foregroundSoft },
  body: { alignItems: 'center', flexDirection: 'row', gap: spacing.base },
  count: { alignItems: 'flex-start' },
  countValue: {
    color: semanticColors.foreground,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    lineHeight: 32,
  },
  label: { color: foregroundSoft },
  divider: {
    alignSelf: 'stretch',
    backgroundColor: semanticColors.borderSubtle,
    width: StyleSheet.hairlineWidth,
  },
  amounts: { flex: 1, gap: spacing.xs, minWidth: 0 },
  amount: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  amountLabel: { color: foregroundSoft, flexShrink: 1 },
  amountValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
});
