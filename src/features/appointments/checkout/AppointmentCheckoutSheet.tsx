// Souris — Appointment checkout sheet (« Encaisser »)
//
// The shared CheckoutSheet with Appointment wording: the expectation block
// lists the service snapshot total and the Products sold during the
// Appointment (linked Sales); the same sheet corrects a recorded payment.

import type { AppointmentPaymentAmounts } from '@/domain/appointments';
import { CheckoutSheet, type CheckoutSummaryLine } from '@/features/checkout/CheckoutSheet';

import { getExpectedTotalCents, type CheckoutExpectation } from './checkout-form';

export type AppointmentCheckoutMode = 'checkout' | 'edit';

interface AppointmentCheckoutSheetProps {
  readonly visible: boolean;
  readonly mode: AppointmentCheckoutMode;
  readonly expectation: CheckoutExpectation;
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
      expectedTotalCents={getExpectedTotalCents(expectation)}
      initialAmounts={initialAmounts}
      onClose={onClose}
      onConfirm={onConfirm}
      summaryLines={summaryLines}
      title={mode === 'edit' ? 'Modifier l’encaissement' : 'Encaisser le rendez-vous'}
      visible={visible}
    />
  );
}
