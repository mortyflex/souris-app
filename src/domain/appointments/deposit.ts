// BeautIzzy — Appointment deposits (« Acomptes ») — pure
//
// Source: docs/domain/APPOINTMENTS.md §25d
//
// A deposit is money ACTUALLY received in advance for an existing
// Appointment. It is NOT a discount: the expected total of the Appointment
// never changes because of a deposit — only what is still to be collected
// does:
//
//   expectedTotalCents        THE canonical expected total (`getAppointmentExpectedTotal`:
//                             services net of the discount + linked Sales)
//   activeDepositTotalCents   Σ ACTIVE deposits of the Appointment (VOIDED count nowhere)
//   remainingCents            max(expected − active deposits, 0) — « Reste à encaisser »,
//                             what the final checkout suggests
//
// THE invariant of a financially open Appointment:
//
//   ACTIVE DEPOSITS <= CURRENT EXPECTED TOTAL
//
// kept by two rules, both here and nowhere else:
//
//   * a new deposit may not exceed the remaining amount (`validateAppointmentDepositAmount`);
//   * a change that LOWERS the expected total of an open Appointment may not
//     take it below its active deposits (`findAppointmentTotalChangeDepositShortfall`).
//     A change that does not lower it is never refused, so a record made
//     inconsistent elsewhere (two devices offline) can still be moved,
//     cancelled or completed.
//
// Two devices editing offline can still merge into a state where the invariant
// does not hold (one lowers the total, the other records a deposit). The remote
// refuses the SECOND of those writes (CLOUD_SYNC.md §21.2), and whatever reaches
// a device anyway — a pull, a restore, an older remote — is DETECTED here
// (`findAppointmentDepositInvariantBreach`) and surfaced as a financial conflict
// to resolve. It is never silently accepted, clamped or repaired.
//
// Screens, sessions and stores ask these functions; none of them sums
// deposits or compares totals on its own. Integer cents only; `now` is
// injected; every operation returns a new value and never mutates its input.

import type { Sale } from '../sales/types';
import { isCheckoutDiscountOpen, setAppointmentDiscount } from './discount';
import { getAppointmentExpectedTotal } from './expected-total';
import { canCompleteAppointment, isEditableAppointmentStatus } from './lifecycle';
import type {
  Appointment,
  AppointmentDeposit,
  AppointmentDiscount,
  AppointmentStatus,
  PaymentMethod,
} from './types';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CARD', 'CASH'];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** A deposit is a strictly positive, exact integer number of cents. */
export function isValidDepositAmountCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

/** A deposit record that is not valid canonical data. Nothing was written. */
export class AppointmentDepositInvalidError extends RangeError {
  constructor(readonly field: string) {
    super(`Appointment deposit is invalid: ${field}`);
    this.name = 'AppointmentDepositInvalidError';
  }
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Validates the SHAPE of a deposit (ids, cents, method, instants, status ↔
 * voidedAt) and returns an independent copy. Whether the Appointment may
 * receive it is `validateAppointmentDeposit`'s question.
 */
export function createAppointmentDeposit(input: AppointmentDeposit): AppointmentDeposit {
  if (input.id.trim().length === 0) throw new AppointmentDepositInvalidError('id');
  if (input.businessId.trim().length === 0) throw new AppointmentDepositInvalidError('businessId');
  if (input.appointmentId.trim().length === 0) throw new AppointmentDepositInvalidError('appointmentId');
  if (!isValidDepositAmountCents(input.amountCents)) throw new AppointmentDepositInvalidError('amountCents');
  if (!isPaymentMethod(input.paymentMethod)) throw new AppointmentDepositInvalidError('paymentMethod');
  if (!isValidDate(input.paidAt)) throw new AppointmentDepositInvalidError('paidAt');
  if (!isValidDate(input.createdAt)) throw new AppointmentDepositInvalidError('createdAt');
  if (input.status === 'ACTIVE') {
    if (input.voidedAt !== undefined) throw new AppointmentDepositInvalidError('voidedAt');
  } else if (input.status === 'VOIDED') {
    if (!isValidDate(input.voidedAt)) throw new AppointmentDepositInvalidError('voidedAt');
  } else {
    throw new AppointmentDepositInvalidError('status');
  }

  return {
    id: input.id,
    businessId: input.businessId,
    appointmentId: input.appointmentId,
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod,
    paidAt: new Date(input.paidAt.getTime()),
    status: input.status,
    ...(input.voidedAt ? { voidedAt: new Date(input.voidedAt.getTime()) } : {}),
    createdAt: new Date(input.createdAt.getTime()),
  };
}

export function isActiveAppointmentDeposit(deposit: Pick<AppointmentDeposit, 'status'>): boolean {
  return deposit.status === 'ACTIVE';
}

/** The deposits of ONE Appointment, oldest payment first (ties by id). VOIDED included. */
export function getAppointmentDeposits(
  deposits: readonly AppointmentDeposit[],
  appointmentId: string,
): readonly AppointmentDeposit[] {
  return deposits
    .filter((deposit) => deposit.appointmentId === appointmentId)
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.id.localeCompare(b.id));
}

/** THE sum: Σ amounts of the ACTIVE deposits given. VOIDED deposits count for nothing. */
export function getActiveDepositTotalCents(
  deposits: readonly Pick<AppointmentDeposit, 'status' | 'amountCents'>[],
): number {
  return deposits.reduce(
    (total, deposit) => (isActiveAppointmentDeposit(deposit) ? total + deposit.amountCents : total),
    0,
  );
}

/** Σ ACTIVE deposits of ONE Appointment. */
export function getAppointmentActiveDepositTotal(
  deposits: readonly AppointmentDeposit[],
  appointmentId: string,
): number {
  return getActiveDepositTotalCents(
    deposits.filter((deposit) => deposit.appointmentId === appointmentId),
  );
}

/** What one Appointment is expected to bring in, what was paid ahead, what is left. */
export interface AppointmentDepositPosition {
  readonly expectedTotalCents: number;
  readonly activeDepositTotalCents: number;
  /** max(expected − active deposits, 0): « Reste à encaisser ». */
  readonly remainingCents: number;
}

/** The position from already-derived totals (the stores read them from SQLite). */
export function getDepositPositionFromTotals(
  expectedTotalCents: number,
  activeDepositTotalCents: number,
): AppointmentDepositPosition {
  return {
    expectedTotalCents,
    activeDepositTotalCents,
    remainingCents: Math.max(expectedTotalCents - activeDepositTotalCents, 0),
  };
}

export function getAppointmentDepositPosition(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): AppointmentDepositPosition {
  return getDepositPositionFromTotals(
    getAppointmentExpectedTotal(appointment, sales).expectedTotalCents,
    getAppointmentActiveDepositTotal(deposits, appointment.id),
  );
}

/** « Reste à encaisser »: expected total − ACTIVE deposits, never below zero. */
export function getAppointmentRemainingAmount(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): number {
  return getAppointmentDepositPosition(appointment, sales, deposits).remainingCents;
}

/**
 * A deposit is RECEIVED only while the financial state of the Appointment is
 * still open — THE editing rule: SCHEDULED, CONFIRMED, IN_PROGRESS. A new
 * deposit is never recorded on a COMPLETED, CANCELLED or NO_SHOW Appointment.
 */
export function isAppointmentFinanciallyOpen(appointment: Pick<Appointment, 'status'>): boolean {
  return isEditableAppointmentStatus(appointment.status);
}

/**
 * Whether a recorded deposit of this Appointment may still be CORRECTED
 * (voided). Wider than receiving one: a mistaken entry stays a mistaken entry
 * after the visit was cancelled or missed, and voiding takes no money and
 * creates no movement — it removes one.
 *
 *   SCHEDULED / CONFIRMED / IN_PROGRESS   correction allowed
 *   CANCELLED / NO_SHOW                   correction allowed (no new deposit)
 *   COMPLETED                             frozen: the visit is settled history
 *
 * It is also the scope of the invariant: a COMPLETED Appointment's expected
 * total may legitimately fall below what was received (a Product removed after
 * checkout — the « Écart » of §25b), which is history, not a conflict.
 */
export function canCorrectAppointmentDeposits(appointment: Pick<Appointment, 'status'>): boolean {
  return appointment.status !== 'COMPLETED';
}

export type AppointmentDepositRefusal =
  /** COMPLETED, CANCELLED or NO_SHOW: the financial state is frozen. */
  | 'APPOINTMENT_NOT_OPEN'
  /** Zero, negative, fractional or not a number of cents. */
  | 'INVALID_AMOUNT'
  /** Above what is still to be collected (the invariant). */
  | 'EXCEEDS_REMAINING';

/** The number-level rule, shared by the domain surfaces and the store's re-verification. */
export function validateAppointmentDepositAmount(input: {
  readonly status: AppointmentStatus;
  readonly expectedTotalCents: number;
  readonly activeDepositTotalCents: number;
  readonly amountCents: number;
}): AppointmentDepositRefusal | undefined {
  if (!isEditableAppointmentStatus(input.status)) return 'APPOINTMENT_NOT_OPEN';
  if (!isValidDepositAmountCents(input.amountCents)) return 'INVALID_AMOUNT';
  const { remainingCents } = getDepositPositionFromTotals(
    input.expectedTotalCents,
    input.activeDepositTotalCents,
  );
  if (input.amountCents > remainingCents) return 'EXCEEDS_REMAINING';
  return undefined;
}

export function validateAppointmentDeposit(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
  amountCents: number,
): AppointmentDepositRefusal | undefined {
  const position = getAppointmentDepositPosition(appointment, sales, deposits);
  return validateAppointmentDepositAmount({
    status: appointment.status,
    expectedTotalCents: position.expectedTotalCents,
    activeDepositTotalCents: position.activeDepositTotalCents,
    amountCents,
  });
}

/** The largest deposit the Appointment can still receive (0 when frozen or fully paid ahead). */
export function getMaximumAppointmentDepositCents(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): number {
  if (!isAppointmentFinanciallyOpen(appointment)) return 0;
  return getAppointmentRemainingAmount(appointment, sales, deposits);
}

/** « Prendre un acompte » is offered only when a deposit of at least 1 cent is acceptable. */
export function canRecordAppointmentDeposit(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): boolean {
  return getMaximumAppointmentDepositCents(appointment, sales, deposits) > 0;
}

/** Only an ACTIVE deposit of an Appointment that is not COMPLETED can be voided. */
export function canVoidAppointmentDeposit(
  deposit: AppointmentDeposit,
  appointment: Pick<Appointment, 'id' | 'status'>,
): boolean {
  return (
    deposit.appointmentId === appointment.id &&
    isActiveAppointmentDeposit(deposit) &&
    canCorrectAppointmentDeposits(appointment)
  );
}

/**
 * « Annuler l'acompte »: a correction of the recorded entry, never a refund.
 * Returns the SAME deposit when it cannot be voided.
 */
export function voidAppointmentDeposit(
  deposit: AppointmentDeposit,
  appointment: Pick<Appointment, 'id' | 'status'>,
  now: Date,
): AppointmentDeposit {
  if (!canVoidAppointmentDeposit(deposit, appointment)) return deposit;
  return { ...deposit, status: 'VOIDED', voidedAt: new Date(now.getTime()) };
}

/** The expected total a change would leave, below what was already paid ahead. */
export interface AppointmentDepositShortfall {
  readonly activeDepositTotalCents: number;
  readonly expectedTotalCents: number;
}

/**
 * THE rule protecting the deposits against later edits, at the level of
 * totals. A change is refused when, the Appointment being financially open
 * BEFORE it, it lowers the expected total AND leaves it below the ACTIVE
 * deposits. Otherwise undefined.
 */
export function findAppointmentTotalChangeDepositShortfall(input: {
  readonly status: AppointmentStatus;
  readonly previousExpectedTotalCents: number;
  readonly nextExpectedTotalCents: number;
  readonly activeDepositTotalCents: number;
}): AppointmentDepositShortfall | undefined {
  if (!isEditableAppointmentStatus(input.status)) return undefined;
  return findTotalDecreaseShortfall(input);
}

function findTotalDecreaseShortfall(input: {
  readonly previousExpectedTotalCents: number;
  readonly nextExpectedTotalCents: number;
  readonly activeDepositTotalCents: number;
}): AppointmentDepositShortfall | undefined {
  if (input.nextExpectedTotalCents >= input.previousExpectedTotalCents) return undefined;
  if (input.nextExpectedTotalCents >= input.activeDepositTotalCents) return undefined;
  return {
    activeDepositTotalCents: input.activeDepositTotalCents,
    expectedTotalCents: input.nextExpectedTotalCents,
  };
}

/**
 * The same rule for a candidate Appointment (and optionally a candidate Sale
 * collection, for a removed Product): computes both expected totals through
 * THE canonical derivation, then asks the total-level rule.
 */
export function findAppointmentChangeDepositShortfall(input: {
  readonly current: Appointment;
  readonly candidate: Appointment;
  readonly sales: readonly Sale[];
  /** The Sales after the change; defaults to `sales`. */
  readonly candidateSales?: readonly Sale[];
  readonly deposits: readonly AppointmentDeposit[];
}): AppointmentDepositShortfall | undefined {
  return findAppointmentTotalChangeDepositShortfall({
    status: input.current.status,
    previousExpectedTotalCents: getAppointmentExpectedTotal(input.current, input.sales)
      .expectedTotalCents,
    nextExpectedTotalCents: getAppointmentExpectedTotal(
      input.candidate,
      input.candidateSales ?? input.sales,
    ).expectedTotalCents,
    activeDepositTotalCents: getAppointmentActiveDepositTotal(input.deposits, input.current.id),
  });
}

/**
 * THE same rule for the discount chosen in the checkout sheet, whose scope is
 * wider than editing (`canChangeAppointmentCheckoutDiscount`): a COMPLETED
 * Appointment without its final payment is still being settled, so its
 * checkout discount may not take the total below the deposits either.
 * Totals-level form, shared by the sheet (through the Appointment form below)
 * and the store.
 */
export function findCheckoutDiscountDepositShortfall(input: {
  readonly status: AppointmentStatus;
  readonly hasPayment: boolean;
  readonly previousExpectedTotalCents: number;
  readonly nextExpectedTotalCents: number;
  readonly activeDepositTotalCents: number;
}): AppointmentDepositShortfall | undefined {
  if (!isCheckoutDiscountOpen(input.status, input.hasPayment)) return undefined;
  return findTotalDecreaseShortfall(input);
}

export function findAppointmentCheckoutDiscountShortfall(input: {
  readonly current: Appointment;
  readonly candidate: Appointment;
  readonly sales: readonly Sale[];
  readonly deposits: readonly AppointmentDeposit[];
}): AppointmentDepositShortfall | undefined {
  return findCheckoutDiscountDepositShortfall({
    status: input.current.status,
    hasPayment: input.current.payment !== undefined,
    previousExpectedTotalCents: getAppointmentExpectedTotal(input.current, input.sales).expectedTotalCents,
    nextExpectedTotalCents: getAppointmentExpectedTotal(input.candidate, input.sales).expectedTotalCents,
    activeDepositTotalCents: getAppointmentActiveDepositTotal(input.deposits, input.current.id),
  });
}

/**
 * ACTIVE deposits ABOVE the expected total: the invariant does not hold. Only
 * a merge of two offline devices (or a remote written before the server-side
 * rule existed) can produce it; every local write refuses it.
 */
export interface AppointmentDepositInvariantBreach {
  readonly expectedTotalCents: number;
  readonly activeDepositTotalCents: number;
  /** How much the deposits exceed the expected total (> 0). */
  readonly excessCents: number;
}

/** The number-level detection, shared by the screens and the sync layer. */
export function findDepositInvariantBreach(input: {
  readonly status: AppointmentStatus;
  readonly expectedTotalCents: number;
  readonly activeDepositTotalCents: number;
}): AppointmentDepositInvariantBreach | undefined {
  // A COMPLETED Appointment is settled history, never a conflict to resolve.
  if (input.status === 'COMPLETED') return undefined;
  const excessCents = input.activeDepositTotalCents - input.expectedTotalCents;
  if (excessCents <= 0) return undefined;
  return {
    expectedTotalCents: input.expectedTotalCents,
    activeDepositTotalCents: input.activeDepositTotalCents,
    excessCents,
  };
}

/**
 * THE detection every surface asks before it shows a remaining amount or
 * offers a financial action. `remainingCents` stays 0 in that state (never
 * negative); the screens must say that the invariant is broken instead of
 * pretending nothing is due.
 */
export function findAppointmentDepositInvariantBreach(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): AppointmentDepositInvariantBreach | undefined {
  const position = getAppointmentDepositPosition(appointment, sales, deposits);
  return findDepositInvariantBreach({
    status: appointment.status,
    expectedTotalCents: position.expectedTotalCents,
    activeDepositTotalCents: position.activeDepositTotalCents,
  });
}

/**
 * Whether the Appointment is financially SETTLED: a final payment is
 * recorded, or it is COMPLETED and its ACTIVE deposits already cover the
 * whole expected total (a fully prepaid visit completes with no payment).
 */
export function isAppointmentSettled(
  appointment: Pick<Appointment, 'status' | 'payment'>,
  position: AppointmentDepositPosition,
): boolean {
  if (appointment.payment !== undefined) return true;
  return (
    appointment.status === 'COMPLETED' &&
    position.activeDepositTotalCents > 0 &&
    position.remainingCents === 0
  );
}

/**
 * A fully prepaid Appointment — ACTIVE deposits cover its whole expected
 * total — can be completed without any new money: no payment is recorded, so
 * nothing new reaches the Cash Register.
 */
export function canCompletePrepaidAppointment(
  appointment: Appointment,
  position: AppointmentDepositPosition,
  now: Date,
): boolean {
  return (
    canCompleteAppointment(appointment, now) &&
    appointment.payment === undefined &&
    position.activeDepositTotalCents > 0 &&
    position.remainingCents === 0
  );
}

/**
 * A COMPLETED Appointment without its final payment whose ACTIVE deposits cover
 * the whole expected total — typically once the checkout discount of a late
 * checkout brings the total down to the deposits. It is settled by the
 * deposits alone: the discount is recorded, and NO payment (not even `0 €`)
 * is created, so nothing new reaches the Cash Register. Judge it on the
 * position of the candidate carrying the final discount.
 *
 * Distinct from an Appointment that costs nothing without deposits: that one
 * is still settled by an ordinary `0 €` checkout.
 */
export function canSettleCompletedAppointmentWithDeposits(
  appointment: Pick<Appointment, 'status' | 'payment'>,
  position: AppointmentDepositPosition,
): boolean {
  return (
    appointment.status === 'COMPLETED' &&
    appointment.payment === undefined &&
    position.activeDepositTotalCents > 0 &&
    position.remainingCents === 0
  );
}

/**
 * « Terminer le rendez-vous » of a fully prepaid Appointment, with the FINAL
 * discount chosen in the checkout sheet (`undefined` = none): the discount
 * goes through THE discount action, the position is judged on that candidate,
 * and the Appointment becomes COMPLETED WITHOUT a payment. Returns the SAME
 * Appointment when this is not a prepaid completion.
 */
export function completePrepaidAppointment(
  appointment: Appointment,
  discount: AppointmentDiscount | undefined,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
  now: Date,
): Appointment {
  const candidate = setAppointmentDiscount(appointment, discount);
  const position = getAppointmentDepositPosition(candidate, sales, deposits);
  if (!canCompletePrepaidAppointment(candidate, position, now)) return appointment;
  if (
    findAppointmentChangeDepositShortfall({ current: appointment, candidate, sales, deposits })
  ) {
    return appointment;
  }
  return { ...candidate, status: 'COMPLETED' };
}
