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
//
// Deposits (docs/domain/APPOINTMENTS.md §25d) are NOT a discount: « Total
// attendu » stays the expected total, then « Acomptes déjà versés » and
// « Reste à encaisser » follow, and the final payment records ONLY the new
// money (the « Reste » shortcut and the « Écart » read the remaining amount).
// A discount draft that would take the expected total below the deposits can
// be explored, but confirmation is blocked and the notice explains why. A
// fully prepaid Appointment (nothing due) completes with « Terminer le
// rendez-vous » and NO payment when nothing is typed.

import { useState } from 'react';

import {
  canEditAppointment,
  findAppointmentChangeDepositShortfall,
  findAppointmentDepositInvariantBreach,
  getAppointmentDepositPosition,
  getAppointmentExpectedTotal,
  getAppointmentServicesTotal,
  getPaymentTotalCents,
  setAppointmentDiscount,
  type Appointment,
  type AppointmentDeposit,
  type AppointmentDiscount,
  type AppointmentPaymentAmounts,
} from '@/domain/appointments';
import type { Sale } from '@/domain/sales';
import { AppointmentDiscountEditor } from '@/features/appointments/editor/components/AppointmentDiscountEditor';
import { DepositShortfallNotice } from '@/features/appointments/deposits/DepositShortfallNotice';
import {
  describeDepositInvariantBreach,
  describeDepositShortfall,
} from '@/features/appointments/deposits/presentation';
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
  /** Every deposit; this Appointment's ACTIVE ones are read through the domain. */
  readonly deposits: readonly AppointmentDeposit[];
  /** Recorded amounts when editing; the sheet opens prefilled with them. */
  readonly initialAmounts?: AppointmentPaymentAmounts;
  readonly onClose: () => void;
  /** The amounts and the FINAL discount of this presentation. */
  readonly onConfirm: (
    amounts: AppointmentPaymentAmounts,
    discount: AppointmentDiscount | undefined,
  ) => void;
  /** Fully prepaid, nothing typed: complete WITHOUT a payment, with the FINAL discount. */
  readonly onCompletePrepaid?: (discount: AppointmentDiscount | undefined) => void;
}

export function AppointmentCheckoutSheet({
  visible,
  mode,
  appointment,
  sales,
  deposits,
  initialAmounts,
  onClose,
  onConfirm,
  onCompletePrepaid,
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
  const position = getAppointmentDepositPosition(candidate, sales, deposits);
  // THE deposit rule: the draft may not take the expected total below the
  // deposits already received (never silently reduced or voided).
  const shortfall = discountEditable
    ? findAppointmentChangeDepositShortfall({ current: appointment, candidate, sales, deposits })
    : undefined;
  // Defensive: an Appointment whose ACTIVE deposits already exceed its expected
  // total (a cross-device merge) settles nothing until the conflict is resolved.
  // Details does not offer checkout then; the sheet refuses it anyway.
  const breach = findAppointmentDepositInvariantBreach(appointment, sales, deposits);
  const hasDeposits = position.activeDepositTotalCents > 0;
  const canCompletePrepaid =
    mode === 'checkout' && hasDeposits && breach === undefined && onCompletePrepaid !== undefined;

  const confirm = (amounts: AppointmentPaymentAmounts) => {
    if (canCompletePrepaid && position.remainingCents === 0 && getPaymentTotalCents(amounts) === 0) {
      onCompletePrepaid(candidate.discount);
      return;
    }
    onConfirm(amounts, candidate.discount);
  };

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
      blockingNotice={
        breach ? (
          <DepositShortfallNotice
            shortfall={describeDepositInvariantBreach(breach)}
            testID="checkout-deposit-conflict"
            tone="conflict"
          />
        ) : shortfall ? (
          <DepositShortfallNotice
            shortfall={describeDepositShortfall(shortfall)}
            testID="checkout-deposit-shortfall"
          />
        ) : undefined
      }
      initialAmounts={initialAmounts}
      onClose={onClose}
      onConfirm={confirm}
      settlement={
        hasDeposits
          ? { depositsCents: position.activeDepositTotalCents, dueCents: position.remainingCents }
          : undefined
      }
      summaryLines={summaryLines}
      zeroBalanceConfirmTitle={canCompletePrepaid ? 'Terminer le rendez-vous' : undefined}
      title={mode === 'edit' ? 'Modifier l’encaissement' : 'Encaisser le rendez-vous'}
      visible={visible}
    />
  );
}
