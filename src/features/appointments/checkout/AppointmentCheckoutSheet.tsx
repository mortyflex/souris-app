// Souris — Appointment checkout sheet (« Encaisser »)
//
// The shared CheckoutSheet with Appointment wording: the expectation block
// lists the service snapshot total, the Appointment discount when there is
// one, and the Products sold during the Appointment (linked Sales); the same
// sheet corrects a recorded payment.
//
// While the Appointment is still editable, checkout also offers the ONE
// AppointmentDiscountEditor (collapsed: « Réduction · Aucune »). Its choice is
// a LOCAL DRAFT of this presentation: every opening starts from the stored
// discount, closing drops the draft, and only « Encaisser » hands the final
// discount to the caller together with the amounts. The expectation is THE
// canonical `getAppointmentExpectedTotal` of the Appointment carrying that
// draft (built by the domain `setAppointmentDiscount`) — the sheet never
// computes a discount itself. A completed Appointment (payment correction,
// or recording the payment of an automatically completed visit) keeps its
// frozen discount: no editor, only the read-only line.

import { useState } from 'react';

import {
  canEditAppointment,
  getAppointmentExpectedTotal,
  getAppointmentServicesTotal,
  setAppointmentDiscount,
  type Appointment,
  type AppointmentDiscount,
  type AppointmentPaymentAmounts,
} from '@/domain/appointments';
import type { Sale } from '@/domain/sales';
import { AppointmentDiscountEditor } from '@/features/appointments/editor/components/AppointmentDiscountEditor';
import { formatDiscountLabel } from '@/features/appointments/presentation';
import { CheckoutSheet, type CheckoutSummaryLine } from '@/features/checkout/CheckoutSheet';

export type AppointmentCheckoutMode = 'checkout' | 'edit';

interface AppointmentCheckoutSheetProps {
  readonly visible: boolean;
  readonly mode: AppointmentCheckoutMode;
  /** The stored Appointment; its discount seeds every presentation. */
  readonly appointment: Appointment;
  /** Every Sale; the linked ones are read through the domain. */
  readonly sales: readonly Sale[];
  /** Recorded amounts when editing; the sheet opens prefilled with them. */
  readonly initialAmounts?: AppointmentPaymentAmounts;
  readonly onClose: () => void;
  /** The amounts and the FINAL discount of this presentation. */
  readonly onConfirm: (
    amounts: AppointmentPaymentAmounts,
    discount: AppointmentDiscount | undefined,
  ) => void;
}

export function AppointmentCheckoutSheet({
  visible,
  mode,
  appointment,
  sales,
  initialAmounts,
  onClose,
  onConfirm,
}: AppointmentCheckoutSheetProps) {
  const discountEditable = mode === 'checkout' && canEditAppointment(appointment);
  const [draftDiscount, setDraftDiscount] = useState(appointment.discount);
  const [discountExpanded, setDiscountExpanded] = useState(false);
  const [presentation, setPresentation] = useState(0);
  // Every presentation starts from the STORED discount, collapsed; an
  // abandoned draft never leaks into the next opening. Derived during render
  // so the first visible frame is already right.
  const [presentedVisible, setPresentedVisible] = useState(visible);
  if (visible !== presentedVisible) {
    setPresentedVisible(visible);
    if (visible) {
      setDraftDiscount(appointment.discount);
      setDiscountExpanded(false);
      setPresentation(presentation + 1);
    }
  }

  // The domain applies the draft (and ignores it once the Appointment is no
  // longer editable); every amount below derives from that one candidate.
  const candidate = discountEditable
    ? setAppointmentDiscount(appointment, draftDiscount)
    : appointment;
  const expectation = getAppointmentExpectedTotal(candidate, sales);

  const summaryLines: CheckoutSummaryLine[] = [
    { label: 'Prestations', cents: expectation.servicesCents, testID: 'checkout-services-total' },
  ];
  if (candidate.discount) {
    summaryLines.push({
      label: formatDiscountLabel(candidate.discount),
      cents: 0 - expectation.discountCents,
      testID: 'checkout-discount',
    });
  }
  if (expectation.productsCents > 0) {
    summaryLines.push({ label: 'Produits', cents: expectation.productsCents, testID: 'checkout-products-total' });
  }

  return (
    <CheckoutSheet
      adjustment={
        discountEditable ? (
          <AppointmentDiscountEditor
            discount={candidate.discount}
            expanded={discountExpanded}
            key={presentation}
            onChange={setDraftDiscount}
            onExpandedChange={setDiscountExpanded}
            servicesTotal={getAppointmentServicesTotal(candidate)}
          />
        ) : undefined
      }
      confirmTitle={mode === 'edit' ? 'Enregistrer' : 'Encaisser'}
      expectedTotalCents={expectation.expectedTotalCents}
      initialAmounts={initialAmounts}
      onClose={onClose}
      onConfirm={(amounts) => onConfirm(amounts, candidate.discount)}
      summaryLines={summaryLines}
      title={mode === 'edit' ? 'Modifier l’encaissement' : 'Encaisser le rendez-vous'}
      visible={visible}
    />
  );
}
