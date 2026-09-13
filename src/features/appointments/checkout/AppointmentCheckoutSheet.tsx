// Souris — Appointment checkout sheet (« Encaisser »)
//
// The shared CheckoutSheet with Appointment wording: the expectation block
// lists the service snapshot total and the Products sold during the
// Appointment (linked Sales); the same sheet corrects a recorded payment.
// The expectation is the ONE canonical `AppointmentExpectedTotal` the
// Details ticket also shows — the sheet never recomputes it.

import type { AppointmentExpectedTotal, AppointmentPaymentAmounts } from '@/domain/appointments';
import { CheckoutSheet, type CheckoutSummaryLine } from '@/features/checkout/CheckoutSheet';

export type AppointmentCheckoutMode = 'checkout' | 'edit';

interface AppointmentCheckoutSheetProps {
  readonly visible: boolean;
  readonly mode: AppointmentCheckoutMode;
  readonly expectation: AppointmentExpectedTotal;
  /** Recorded amounts when editing; the sheet opens prefilled with them. */
  readonly initialAmounts?: AppointmentPaymentAmounts;
  readonly onClose: () => void;
  readonly onConfirm: (amounts: AppointmentPaymentAmounts) => void;
}

export function AppointmentCheckoutSheet({
  visible,
  mode,
  expectation,
  initialAmounts,
  onClose,
  onConfirm,
}: AppointmentCheckoutSheetProps) {
  const summaryLines: CheckoutSummaryLine[] = [
    { label: 'Prestations', cents: expectation.servicesCents, testID: 'checkout-services-total' },
  ];
  if (expectation.productsCents > 0) {
    summaryLines.push({ label: 'Produits', cents: expectation.productsCents, testID: 'checkout-products-total' });
  }

  return (
    <CheckoutSheet
      confirmTitle={mode === 'edit' ? 'Enregistrer' : 'Encaisser'}
      expectedTotalCents={expectation.expectedTotalCents}
      initialAmounts={initialAmounts}
      onClose={onClose}
      onConfirm={onConfirm}
      summaryLines={summaryLines}
      title={mode === 'edit' ? 'Modifier l’encaissement' : 'Encaisser le rendez-vous'}
      visible={visible}
    />
  );
}
