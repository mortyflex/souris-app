// BeautIzzy — recorded checkout of a completed Appointment
//
// Replaces « Encaisser » once a payment exists: the received total, then
// the card / cash split (a zero method is not listed), then the restrained
// correction action. Values are the stored integer cents — never a live
// recalculation. When the expected total no longer matches what was
// received (a Revente removed after checkout, a discount, a tip), one quiet
// « Écart » line shows the signed difference — received minus what was DUE
// at the final checkout (expected − ACTIVE deposits) — exactly as the
// checkout sheet does. The payment is the final checkout only: deposits are
// listed in their own section and never counted here twice. The payment itself is never rewritten
// here; « Modifier l’encaissement » remains the correction.
//
// When the money was received on another local day than the Appointment's
// (a checkout recorded later, dated « Aujourd’hui »), one quiet line names
// that day — « Encaissé le 28 septembre 2026 » — the day the Caisse counts it.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { getPaymentTotalCents, type AppointmentPayment } from '@/domain/appointments';
import { getCashRegisterDayKey } from '@/domain/cash-register';
import {
  paymentMethodIcons,
  paymentMethodLabels,
  type PaymentMethod,
} from '@/shared/icons/payment-method-icons';
import { formatEuroCents, formatSignedEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface AppointmentPaymentSummaryProps {
  readonly payment: AppointmentPayment;
  /** What the final checkout was expected to collect (domain remaining amount); « Écart » only when it differs. */
  readonly dueCents: number;
  /** The Appointment start: « Encaissé le » appears only when the payment day differs. */
  readonly appointmentStartAt: Date;
  readonly onEdit: () => void;
}

const paymentDayFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function AppointmentPaymentSummary({
  payment,
  dueCents,
  appointmentStartAt,
  onEdit,
}: AppointmentPaymentSummaryProps) {
  const total = getPaymentTotalCents(payment);
  const difference = total - dueCents;
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
      {getCashRegisterDayKey(payment.paidAt) !== getCashRegisterDayKey(appointmentStartAt) && (
        <AppText variant="metadata" style={styles.paymentDay} testID="appointment-payment-day">
          Encaissé le {paymentDayFormatter.format(payment.paidAt)}
        </AppText>
      )}
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
      {difference !== 0 && (
        <AppText variant="metadata" style={styles.difference} testID="appointment-payment-difference">
          Écart : {formatSignedEuroCents(difference)}
        </AppText>
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
  paymentDay: { color: foregroundSoft },
  difference: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  editAction: { alignSelf: 'flex-start', marginLeft: -spacing.md, marginTop: spacing.xs },
});
