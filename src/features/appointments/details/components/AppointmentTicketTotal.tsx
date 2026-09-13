// Souris — « Total à encaisser » of one Appointment
//
// The real pre-checkout total: service snapshots + the Products sold during
// the Appointment, from the ONE canonical expected-total derivation the
// checkout sheet also consumes. Always shown — with no linked Sale it simply
// equals the Prestations subtotal. Stronger than the subtotals above it,
// without becoming an accounting block.

import { StyleSheet, View } from 'react-native';

import type { AppointmentExpectedTotal } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { lavender, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentTicketTotalProps {
  readonly expectedTotal: AppointmentExpectedTotal;
}

export function AppointmentTicketTotal({ expectedTotal }: AppointmentTicketTotalProps) {
  return (
    <View
      accessible
      accessibilityLabel={`Total à encaisser ${formatEuroCents(expectedTotal.expectedTotalCents)}`}
      style={styles.row}
      testID="appointment-expected-total"
    >
      <AppText variant="eyebrow" style={styles.label}>
        TOTAL À ENCAISSER
      </AppText>
      <AppText
        variant="summaryValue"
        selectable
        style={styles.value}
        testID="appointment-expected-total-value"
      >
        {formatEuroCents(expectedTotal.expectedTotalCents)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  label: { color: semanticColors.foreground },
  value: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
});
