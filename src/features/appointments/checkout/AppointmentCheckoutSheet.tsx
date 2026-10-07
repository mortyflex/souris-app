// BeautIzzy — Appointment checkout sheet (« Encaisser »)
//
// The shared CheckoutSheet with Appointment wording: the expectation block
// lists the service snapshot total, the Appointment discount when there is
// one, and the Products sold during the Appointment (linked Sales); the same
// sheet corrects a recorded payment.
//
// Exact settlement (§25b): the amounts must settle EXACTLY the checkout due
// (`getCheckoutPaymentBounds`); a correction stays within its domain range
// (`getPaymentCorrectionBounds`: the due, or a legacy recorded total). The
// sheet passes those bounds as its `allocation`, so the Card / Cash owners and
// the « Reste à répartir » feedback apply — never to the standalone Sale.
//
// « Encaissé le » (`paymentDate`): the FIRST final payment of an Appointment
// of an earlier local day chooses « Jour du rendez-vous » (default) or
// « Aujourd’hui »; the session turns the choice into `paidAt`. Same-day
// checkouts and corrections show no choice.
//
// While the checkout discount may still change — an editable Appointment, or a
// COMPLETED one whose final payment is not recorded yet
// (`canChangeAppointmentCheckoutDiscount`) — checkout also offers the ONE
// AppointmentDiscountEditor (collapsed: « Réduction · Aucune »). Its choice is
// a LOCAL DRAFT of this presentation: every opening starts from the stored
// discount, closing drops the draft, and only « Encaisser » hands the final
// discount to the caller together with the amounts. The expectation is THE
// canonical `getAppointmentExpectedTotal` of the Appointment carrying that
// draft (built by the domain `setAppointmentCheckoutDiscount`) — the sheet
// never computes a discount itself. A payment correction keeps the frozen
// discount: no editor, only the read-only line.
//
// Deposits (docs/domain/APPOINTMENTS.md §25d) are NOT a discount: « Total
// attendu » stays the expected total, then « Acomptes déjà versés » and
// « Reste à encaisser » follow, and the final payment records ONLY the new
// money (the « Reste » shortcut and the allocation read the remaining amount).
// A discount draft that would take the expected total below the deposits can
// be explored, but confirmation is blocked and the notice explains why. A
// fully prepaid Appointment (nothing due) completes with « Terminer le
// rendez-vous » and NO payment when nothing is typed. An Appointment already
// COMPLETED without payment whose checkout discount brings the total down to
// the deposits is settled by them: « Enregistrer » saves the discount alone,
// with « Le rendez-vous est entièrement couvert par les acomptes. »

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  canChangeAppointmentCheckoutDiscount,
  canChooseAppointmentPaymentDate,
  canSettleCompletedAppointmentWithDeposits,
  findAppointmentCheckoutDiscountShortfall,
  findAppointmentDepositInvariantBreach,
  getAppointmentDepositPosition,
  getAppointmentExpectedTotal,
  getAppointmentServicesTotal,
  getCheckoutPaymentBounds,
  getPaymentCorrectionBounds,
  getPaymentTotalCents,
  setAppointmentCheckoutDiscount,
  type Appointment,
  type AppointmentDeposit,
  type AppointmentDiscount,
  type AppointmentPaymentAmounts,
  type AppointmentPaymentDate,
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
import type { CheckoutAllocation } from '@/features/checkout/checkout-form';
import { AppText } from '@/shared/ui/AppText';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

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
  /** The amounts, the FINAL discount and the « Encaissé le » choice of this presentation. */
  readonly onConfirm: (
    amounts: AppointmentPaymentAmounts,
    discount: AppointmentDiscount | undefined,
    paymentDate: AppointmentPaymentDate,
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
  const discountEditable = mode === 'checkout' && canChangeAppointmentCheckoutDiscount(appointment);
  const [draftDiscount, setDraftDiscount] = useState(appointment.discount);
  const [discountExpanded, setDiscountExpanded] = useState(false);
  const [paymentDate, setPaymentDate] = useState<AppointmentPaymentDate>('APPOINTMENT_DAY');
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
      setPaymentDate('APPOINTMENT_DAY');
      setPresentation(presentation + 1);
    }
  }

  // The domain applies the draft (and ignores it once the Appointment is no
  // longer editable); every amount below derives from that one candidate.
  const candidate = discountEditable
    ? setAppointmentCheckoutDiscount(appointment, draftDiscount)
    : appointment;
  const expectation = getAppointmentExpectedTotal(candidate, sales);
  const position = getAppointmentDepositPosition(candidate, sales, deposits);
  // THE deposit rule: the draft may not take the expected total below the
  // deposits already received (never silently reduced or voided).
  const shortfall = discountEditable
    ? findAppointmentCheckoutDiscountShortfall({ current: appointment, candidate, sales, deposits })
    : undefined;
  // Defensive: an Appointment whose ACTIVE deposits already exceed its expected
  // total (a cross-device merge) settles nothing until the conflict is resolved.
  // Details does not offer checkout then; the sheet refuses it anyway.
  const breach = findAppointmentDepositInvariantBreach(appointment, sales, deposits);
  const hasDeposits = position.activeDepositTotalCents > 0;
  // « Terminer » (open Appointment) — or, for an Appointment ALREADY
  // COMPLETED without payment, « Enregistrer »: the discount alone is saved
  // and the deposits settle it (no payment).
  const canCompletePrepaid =
    mode === 'checkout' && hasDeposits && breach === undefined && onCompletePrepaid !== undefined;
  const alreadyCompleted = appointment.status === 'COMPLETED';
  const settledByDeposits =
    mode === 'checkout' &&
    alreadyCompleted &&
    shortfall === undefined &&
    breach === undefined &&
    canSettleCompletedAppointmentWithDeposits(candidate, position);
  // THE domain bounds. Deposits covering everything accept no payment: the
  // range collapses to zero, which is « Terminer » (prepaid completion).
  const checkoutBounds = getCheckoutPaymentBounds(position);
  const recorded = initialAmounts ?? appointment.payment;
  const allocation: CheckoutAllocation =
    mode === 'edit' && recorded
      ? { ...getPaymentCorrectionBounds(position, recorded), targetCents: getPaymentTotalCents(recorded) }
      : checkoutBounds
        ? { ...checkoutBounds, targetCents: checkoutBounds.minimumCents }
        : { minimumCents: 0, maximumCents: 0, targetCents: 0 };
  // No payment will be recorded when the deposits settle it: no date to choose.
  const showPaymentDate =
    mode === 'checkout' && !settledByDeposits && canChooseAppointmentPaymentDate(appointment, new Date());

  const confirm = (amounts: AppointmentPaymentAmounts) => {
    if (canCompletePrepaid && position.remainingCents === 0 && getPaymentTotalCents(amounts) === 0) {
      onCompletePrepaid(candidate.discount);
      return;
    }
    onConfirm(amounts, candidate.discount, showPaymentDate ? paymentDate : 'TODAY');
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
      note={
        settledByDeposits ? (
          <AppText variant="metadata" style={styles.note} testID="checkout-deposits-cover">
            Le rendez-vous est entièrement couvert par les acomptes.
          </AppText>
        ) : undefined
      }
      allocation={allocation}
      paymentDate={
        showPaymentDate ? (
          <View style={styles.paymentDate} testID="checkout-payment-date">
            <AppText variant="control" style={styles.paymentDateLabel}>
              Encaissé le
            </AppText>
            <SegmentedControl
              onChange={setPaymentDate}
              options={PAYMENT_DATE_OPTIONS}
              stretch
              testID="checkout-payment-date-choice"
              value={paymentDate}
            />
          </View>
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
      zeroBalanceConfirmTitle={
        canCompletePrepaid ? (alreadyCompleted ? 'Enregistrer' : 'Terminer le rendez-vous') : undefined
      }
      title={mode === 'edit' ? 'Modifier l’encaissement' : 'Encaisser le rendez-vous'}
      visible={visible}
    />
  );
}

const PAYMENT_DATE_OPTIONS = [
  { value: 'APPOINTMENT_DAY', label: 'Jour du rendez-vous', testID: 'checkout-payment-date-appointment-day' },
  { value: 'TODAY', label: 'Aujourd’hui', testID: 'checkout-payment-date-today' },
] as const;

const styles = StyleSheet.create({
  paymentDate: { gap: spacing.sm },
  paymentDateLabel: { color: semanticColors.foreground, paddingHorizontal: spacing.xs },
  note: { color: foregroundSoft, paddingHorizontal: spacing.xs },
});
