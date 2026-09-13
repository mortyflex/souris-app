// Souris — recorded checkout of a completed Appointment
//
// Replaces « Encaisser » once a payment exists: the received total, then
// the card / cash split (a zero method is not listed), then the restrained
// correction action. Values are the stored integer cents — never a live
// recalculation.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { getPaymentTotalCents, type AppointmentPayment } from '@/domain/appointments';
import {
  paymentMethodIcons,
  paymentMethodLabels,
  type PaymentMethod,
} from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentPaymentSummaryProps {
  readonly payment: AppointmentPayment;
  readonly onEdit: () => void;
}

export function AppointmentPaymentSummary({ payment, onEdit }: AppointmentPaymentSummaryProps) {
  const total = getPaymentTotalCents(payment);
  const allMethods: readonly { readonly method: PaymentMethod; readonly cents: number }[] = [
    { method: 'CARD', cents: payment.cardAmountCents },
    { method: 'CASH', cents: payment.cashAmountCents },
  ];
  const methods = allMethods.filter(({ cents }) => cents > 0);

  return (
    <View style={styles.surface} testID="appointment-payment">
      <AppText variant="eyebrow" style={styles.eyebrow}>
        Encaissement
      </AppText>
      <AppText variant="summaryValue" selectable style={styles.total} testID="appointment-payment-total">
        {formatEuroCents(total)}
      </AppText>
      {methods.length > 0 && (
        <View style={styles.methods}>
          {methods.map(({ method, cents }) => (
            <View accessible key={method} style={styles.methodRow} testID={`appointment-payment-${method.toLowerCase()}`}>
              <SymbolView name={paymentMethodIcons[method]} size={16} tintColor={lavender.lav700} />
              <AppText variant="metadata" style={styles.methodLabel}>
                {paymentMethodLabels[method]}
              </AppText>
              <AppText variant="control" style={styles.methodValue}>
                {formatEuroCents(cents)}
              </AppText>
            </View>
          ))}
        </View>
      )}
      <AppButton
        accessibilityLabel="Modifier l’encaissement"
        onPress={onEdit}
        style={styles.editAction}
        testID="edit-payment"
        title="Modifier l’encaissement"
        variant="tertiary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    marginTop: spacing.xl,
    padding: spacing.base,
  },
  eyebrow: { color: semanticColors.accent },
  total: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  methods: { gap: spacing.xs, marginTop: spacing.sm },
  methodRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 28 },
  methodLabel: { color: foregroundSoft, flex: 1 },
  methodValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  editAction: { alignSelf: 'flex-start', marginLeft: -spacing.md, marginTop: spacing.xs },
});
