// BeautIzzy — Accueil « Cette semaine »
//
// The current Agenda week in TWO compact white cards side by side, 42 : 58:
//
//   [ 5–11 octobre   ]   [ Déjà encaissé sur ces RDV   140 € ]
//   [ 8 rendez-vous  ]   [ CA potentiel des RDV        360 € ]
//
// The left one says WHEN and HOW MANY, the right one is money only, as two
// label → amount rows. Both amounts concern the week's APPOINTMENTS — never every
// Caisse movement of the week (standalone Sales, refunds): the labels say so
// (« RDV », spoken « rendez-vous de la semaine »). About 100 pt tall: a secondary summary, quieter than
// today's pair — no glyph, no chart. Display only — the three figures are
// the domain period summary of the week, the very figures of « Résumé de la
// semaine ».

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

const CARD_PADDING = 14;
const LABEL_SIZE = 12.5;

interface HomeWeekSummaryProps {
  /** `5–11 octobre` */
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
    <View style={styles.row} testID="home-week-summary">
      <View
        accessible
        accessibilityLabel={`${rangeLabel}, ${appointmentCount} rendez-vous cette semaine`}
        style={[styles.card, styles.countCard]}
        testID="home-week-appointments-card"
      >
        <AppText variant="metadata" numberOfLines={2} style={styles.label}>
          {rangeLabel}
        </AppText>
        {/* One baseline; the label drops under a count too wide for the column. */}
        <View style={styles.count}>
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
      </View>
      <View style={[styles.card, styles.moneyCard]} testID="home-week-money-card">
        <Amount
          label={HOME_WEEK_COLLECTED_LABEL}
          spokenLabel="Déjà encaissé sur les rendez-vous de la semaine"
          testID="home-week-collected"
          value={collected}
        />
        <Amount
          label={HOME_WEEK_POTENTIAL_LABEL}
          spokenLabel="CA potentiel des rendez-vous de la semaine"
          testID="home-week-potential"
          value={potential}
        />
      </View>
    </View>
  );
}

/**
 * The week's money concerns its Appointments only: said on the card, not left to guess.
 * Non-breaking spaces keep the scope together when the label takes two lines
 * (« Déjà encaissé / sur ces RDV », « CA potentiel / des RDV »).
 */
export const HOME_WEEK_COLLECTED_LABEL = 'Déjà encaissé sur\u00a0ces\u00a0RDV';
export const HOME_WEEK_POTENTIAL_LABEL = 'CA potentiel des\u00a0RDV';

function Amount({
  label,
  spokenLabel,
  value,
  testID,
}: {
  readonly label: string;
  /** The label in full words for assistive technology (no abbreviation). */
  readonly spokenLabel: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${spokenLabel}, ${value}`}
      style={styles.amount}
    >
      {/* The label gives way — onto a second line — never the amount. */}
      <AppText variant="metadata" numberOfLines={2} style={styles.amountLabel}>
        {label}
      </AppText>
      <AppText
        numberOfLines={1}
        // `1 120 €` at full size; a long amount one step down, never auto-shrunk.
        variant={value.length <= 7 ? 'stateTitle' : 'control'}
        style={styles.amountValue}
        testID={testID}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, minHeight: 100 },
  // Both cards spread their two lines over the shared height: the range faces
  // « Déjà encaissé sur ces RDV », the count faces « CA potentiel des RDV ».
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: CARD_PADDING,
  },
  countCard: { flex: 42 },
  moneyCard: { flex: 58 },
  count: {
    alignItems: 'baseline',
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  countValue: {
    color: semanticColors.foreground,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    lineHeight: 32,
  },
  // One step under `metadata`: what lets « 24 rendez-vous » and
  // « Déjà encaissé  1 250 € » each hold on one line at 375 pt (iPhone SE).
  label: { color: foregroundSoft, fontSize: LABEL_SIZE },
  amount: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  amountLabel: { color: foregroundSoft, flexShrink: 1, fontSize: LABEL_SIZE },
  amountValue: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
