// BeautIzzy — Appointment checkout and payment rules
//
// Source: docs/domain/APPOINTMENTS.md §25b (checkout)
//
// "Encaisser" is the professional confirming that the Appointment is
// finished AND recording how much was actually received by card and/or
// cash. Amounts are INTEGER CENTS; nothing here formats or parses money.
// `now` is injected. Every operation returns a new Appointment and never
// mutates its input.

import {
  areAppointmentDiscountsEqual,
  canChangeAppointmentCheckoutDiscount,
  isValidAppointmentDiscount,
  setAppointmentCheckoutDiscount,
} from './discount';
import { canCompleteAppointment } from './lifecycle';
import type { Appointment, AppointmentDiscount, AppointmentPayment } from './types';

/** The amounts the professional records; both non-negative integer cents. */
export interface AppointmentPaymentAmounts {
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}

/**
 * Converts a euro number that is already meaningful at two decimals (a
 * snapshot price, a derived total) into integer cents. The tiny epsilon
 * absorbs binary representation error (`0.29 * 100 = 28.999…`,
 * `1.005 * 100 = 100.499…`) before rounding.
 */
export function eurosToCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`eurosToCents: ${value} is not a finite amount`);
  }
  const scaled = value * 100;
  return Math.round(scaled + Math.sign(scaled) * 1e-7);
}

/** A checkout amount is a non-negative integer number of cents. */
export function isValidPaymentAmountCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function areValidPaymentAmounts(amounts: AppointmentPaymentAmounts): boolean {
  return (
    isValidPaymentAmountCents(amounts.cardAmountCents) &&
    isValidPaymentAmountCents(amounts.cashAmountCents)
  );
}

/** Derived, never stored: card + cash. Exact integer arithmetic. */
export function getPaymentTotalCents(amounts: AppointmentPaymentAmounts): number {
  return amounts.cardAmountCents + amounts.cashAmountCents;
}

/**
 * Manual checkout is allowed for an Appointment that could be completed
 * now (SCHEDULED / CONFIRMED / IN_PROGRESS once started), and for an
 * already COMPLETED Appointment without payment (a historical or
 * automatically completed record whose checkout is recorded afterwards).
 * CANCELLED and NO_SHOW can never be checked out. Status-level only: an
 * Appointment whose ACTIVE deposits already cover everything receives no
 * payment either — `validateAppointmentCheckoutAmounts` (`./checkout`).
 */
export function canCheckoutAppointment(appointment: Appointment, now: Date): boolean {
  if (appointment.status === 'COMPLETED') return appointment.payment === undefined;
  return canCompleteAppointment(appointment, now);
}

/** Only a completed Appointment with a recorded payment can have it corrected. */
export function canEditAppointmentPayment(appointment: Appointment): boolean {
  return appointment.status === 'COMPLETED' && appointment.payment !== undefined;
}

/**
 * The STANDALONE Sale tolerance (docs/domain/SALES.md): a received total is
 * acceptable when it is positive, or when the expected total is itself zero.
 * It may otherwise differ from the expected total. An Appointment final
 * checkout is stricter — it settles EXACTLY the due (`./checkout`).
 */
export function isCheckoutTotalAcceptable(
  expectedTotalCents: number,
  enteredTotalCents: number,
): boolean {
  if (enteredTotalCents < 0) return false;
  return expectedTotalCents <= 0 || enteredTotalCents > 0;
}

function assertValidAmounts(amounts: AppointmentPaymentAmounts, operation: string): void {
  if (!areValidPaymentAmounts(amounts)) {
    throw new RangeError(
      `${operation}: amounts must be non-negative integer cents (card ${amounts.cardAmountCents}, cash ${amounts.cashAmountCents})`,
    );
  }
}

function assertValidPaidAt(paidAt: Date, now: Date, operation: string): void {
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > now.getTime()) {
    throw new RangeError(`${operation}: paidAt must be a valid instant, never in the future`);
  }
}

/**
 * Explicit checkout: the Appointment becomes COMPLETED and carries the
 * recorded payment, received at `paidAt` (default `now`; an earlier instant
 * for a payment dated on the appointment day — `getAppointmentPaymentInstant`).
 * Returns the SAME Appointment when checkout is not allowed; throws on
 * invalid amounts or a future `paidAt` so a broken input never reaches
 * persistence. Whether the amounts settle the due is `./checkout`'s question
 * (it needs the linked Sales and the deposits); the store re-verifies it.
 */
export function checkoutAppointment(
  appointment: Appointment,
  amounts: AppointmentPaymentAmounts,
  now: Date,
  paidAt: Date = now,
): Appointment {
  assertValidAmounts(amounts, 'checkoutAppointment');
  assertValidPaidAt(paidAt, now, 'checkoutAppointment');
  if (!canCheckoutAppointment(appointment, now)) return appointment;

  const payment: AppointmentPayment = {
    paidAt: new Date(paidAt.getTime()),
    cardAmountCents: amounts.cardAmountCents,
    cashAmountCents: amounts.cashAmountCents,
  };
  return { ...appointment, status: 'COMPLETED', payment };
}

/**
 * Checkout with the discount chosen in the checkout sheet: the final
 * discount and the recorded payment form ONE next record, so a completed
 * Appointment never exists without the discount its payment was taken
 * against. `discount` is the FINAL choice (`undefined` = no discount).
 *
 * The discount follows THE checkout discount rule
 * (`canChangeAppointmentCheckoutDiscount`): an editable Appointment, or a
 * COMPLETED one recording its FIRST payment afterwards — exact settlement
 * needs the discount to charge less. Once a payment exists the discount is
 * frozen (and no checkout is possible anyway). Throws on an invalid discount,
 * invalid amounts or a future `paidAt`.
 */
export function checkoutAppointmentWithDiscount(
  appointment: Appointment,
  discount: AppointmentDiscount | undefined,
  amounts: AppointmentPaymentAmounts,
  now: Date,
  paidAt: Date = now,
): Appointment {
  if (discount !== undefined && !isValidAppointmentDiscount(discount)) {
    throw new RangeError(`checkoutAppointmentWithDiscount: invalid ${discount.type} discount`);
  }
  assertValidAmounts(amounts, 'checkoutAppointmentWithDiscount');
  assertValidPaidAt(paidAt, now, 'checkoutAppointmentWithDiscount');
  if (!canCheckoutAppointment(appointment, now)) return appointment;
  if (areAppointmentDiscountsEqual(appointment.discount, discount)) {
    return checkoutAppointment(appointment, amounts, now, paidAt);
  }
  if (!canChangeAppointmentCheckoutDiscount(appointment)) return appointment;
  return checkoutAppointment(setAppointmentCheckoutDiscount(appointment, discount), amounts, now, paidAt);
}

/**
 * Correction of a recorded payment: the card/cash split changes, the
 * status and the original `paidAt` are preserved, no second record is
 * created. Returns the SAME Appointment when there is nothing to correct.
 */
export function updateAppointmentPayment(
  appointment: Appointment,
  amounts: AppointmentPaymentAmounts,
): Appointment {
  assertValidAmounts(amounts, 'updateAppointmentPayment');
  if (!canEditAppointmentPayment(appointment) || !appointment.payment) return appointment;

  return {
    ...appointment,
    payment: {
      paidAt: appointment.payment.paidAt,
      cardAmountCents: amounts.cardAmountCents,
      cashAmountCents: amounts.cashAmountCents,
    },
  };
}

/** Every record that anchors an Appointment in business history. */
export interface AppointmentReferences {
  readonly hasPayment: boolean;
  readonly saleCount: number;
  /** Deposits of the Appointment, ACTIVE and VOIDED alike (financial history). */
  readonly depositCount: number;
}

/**
 * Permanent deletion is refused once the Appointment carries a recorded
 * payment (Cash Register history), is linked to a Product Sale, or holds a
 * deposit — even a VOIDED one, which stays the trace of a corrected entry.
 * Historical integrity wins: no cascade, no hidden un-linking.
 */
export function canDeleteAppointmentPermanently(references: AppointmentReferences): boolean {
  return !references.hasPayment && references.saleCount === 0 && references.depositCount === 0;
}
