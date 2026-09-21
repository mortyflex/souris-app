// Souris — « Total à encaisser » of one Appointment
//
// The real pre-checkout total: service snapshots + the Products sold during
// the Appointment, from the ONE canonical expected-total derivation the
// checkout sheet also consumes. Always shown — with no linked Sale it simply
// equals the Prestations subtotal. Stronger than the subtotals above it,
// without becoming an accounting block.
//
// With an Appointment discount, ONE restrained « Réduction » line sits above
// the total so the ticket reads gross (the Prestations banner) → discount →
// total. Without a discount the line does not exist.

import { StyleSheet, View } from 'react-native';

import type { AppointmentDiscount, AppointmentExpectedTotal } from '@/domain/appointments';
import {
  formatDiscountAmount,
  formatDiscountLabel,
  formatDiscountSpokenValue,
} from '@/features/appointments/presentation';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentTicketTotalProps {
  readonly expectedTotal: AppointmentExpectedTotal;
  readonly discount?: AppointmentDiscount;
}

export function AppointmentTicketTotal({ expectedTotal, discount }: AppointmentTicketTotalProps) {
  return (
    <>
      {discount && (
        <View
          accessible
          accessibilityLabel={`Réduction de ${formatDiscountSpokenValue(discount)}, ${formatDiscountAmount(expectedTotal.discountCents)}`}
          style={styles.discountRow}
          testID="appointment-discount-row"
        >
          <AppText variant="metadata" style={styles.discountLabel}>
            {formatDiscountLabel(discount)}
          </AppText>
          <AppText
            variant="metadata"
            selectable
            style={styles.discountValue}
            testID="appointment-discount-value"
          >
            {formatDiscountAmount(expectedTotal.discountCents)}
          </AppText>
        </View>
      )}
      <TotalRow expectedTotal={expectedTotal} />
    </>
  );
}

function TotalRow({ expectedTotal }: { readonly expectedTotal: AppointmentExpectedTotal }) {
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
  discountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  discountLabel: { color: foregroundSoft },
  discountValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
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
