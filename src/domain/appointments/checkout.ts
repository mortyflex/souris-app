// BeautIzzy — Appointment final checkout settlement (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25b
//
// THE amount a final checkout settles, and THE rules every surface and the
// store ask before a final payment is written:
//
//   expectedTotalCents   `getAppointmentExpectedTotal` (services − discount + linked Sales)
//   activeDeposits       Σ ACTIVE deposits (`getAppointmentActiveDepositTotal`)
//   checkout due         max(expected − active deposits, 0) — the deposit
//                        position's `remainingCents`, « Reste à encaisser »
//
// A NEW final payment settles EXACTLY the checkout due: card + cash === due.
// Less is not a partial payment (not a V1 concept) and more is not a tip:
// charging less goes through the explicit Appointment discount. An
// Appointment whose ACTIVE deposits already cover the whole expected total
// receives no payment at all — « Terminer » completes it.
//
// A CORRECTION (« Modifier l’encaissement ») keeps the recorded total within
// [min(due, recorded), max(due, recorded)]. With a recorded total equal to the
// due — every payment recorded under the exact rule — that is exactly the due.
// The wider range is legacy compatibility only: payments recorded before the
// exact rule (a tip, an adjustment) may be preserved or brought towards the
// due, never pushed further away from it.
//
// Payment date (`paidAt`) is when the money was received — the Cash Register
// day. The first final payment of an Appointment of an EARLIER local day may be
// dated on that day (« Jour du rendez-vous »): its end instant, kept inside the
// appointment's local day. Otherwise it is `now`. A correction never moves it.
//
// Integer cents only; `now` is injected; nothing is mutated.

import type { Sale } from '../sales/types';
import { getAppointmentDepositPosition, type AppointmentDepositPosition } from './deposit';
import { isPreviousLocalDay } from './lifecycle';
import {
  areValidPaymentAmounts,
  getPaymentTotalCents,
  type AppointmentPaymentAmounts,
} from './payment';
import { getAppointmentEndAt } from './timeline';
import type { Appointment, AppointmentDeposit } from './types';

export type AppointmentCheckoutRefusal =
  /** Negative, fractional or not a number of cents. */
  | 'INVALID_AMOUNT'
  /** A final payment exists, or ACTIVE deposits already cover the whole total. */
  | 'ALREADY_SETTLED'
  /** A correction of an Appointment that has no recorded payment. */
  | 'NO_PAYMENT'
  /** Below what must be settled. */
  | 'UNDER_DUE'
  /** Above what may be settled. */
  | 'EXCEEDS_DUE';

/** The accepted range of a payment total, both ends included, in integer cents. */
export interface AppointmentPaymentBounds {
  readonly minimumCents: number;
  readonly maximumCents: number;
}

/** « Reste à encaisser »: what a NEW final checkout settles, never below zero. */
export function getAppointmentCheckoutDueCents(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
): number {
  return getAppointmentDepositPosition(appointment, sales, deposits).remainingCents;
}

/**
 * The range of a NEW final payment: exactly the due. Undefined when ACTIVE
 * deposits already cover the whole expected total — no payment is possible.
 */
export function getCheckoutPaymentBounds(
  position: AppointmentDepositPosition,
): AppointmentPaymentBounds | undefined {
  if (position.activeDepositTotalCents > 0 && position.remainingCents === 0) return undefined;
  return { minimumCents: position.remainingCents, maximumCents: position.remainingCents };
}

/** The range of a correction: between the due and the recorded total (legacy compatibility). */
export function getPaymentCorrectionBounds(
  position: AppointmentDepositPosition,
  recorded: AppointmentPaymentAmounts,
): AppointmentPaymentBounds {
  const recordedCents = getPaymentTotalCents(recorded);
  return {
    minimumCents: Math.min(position.remainingCents, recordedCents),
    maximumCents: Math.max(position.remainingCents, recordedCents),
  };
}

/** THE number-level rule, shared by the checkout form and the store. */
export function validatePaymentWithinBounds(
  bounds: AppointmentPaymentBounds,
  amounts: AppointmentPaymentAmounts,
): AppointmentCheckoutRefusal | undefined {
  if (!areValidPaymentAmounts(amounts)) return 'INVALID_AMOUNT';
  const totalCents = getPaymentTotalCents(amounts);
  if (totalCents < bounds.minimumCents) return 'UNDER_DUE';
  if (totalCents > bounds.maximumCents) return 'EXCEEDS_DUE';
  return undefined;
}

/** A NEW final payment against an already derived position (the store reads it from SQLite). */
export function validateCheckoutAmounts(
  position: AppointmentDepositPosition,
  amounts: AppointmentPaymentAmounts,
): AppointmentCheckoutRefusal | undefined {
  const bounds = getCheckoutPaymentBounds(position);
  if (!bounds) return 'ALREADY_SETTLED';
  return validatePaymentWithinBounds(bounds, amounts);
}

/** A correction against an already derived position and the recorded payment. */
export function validatePaymentCorrectionAmounts(
  position: AppointmentDepositPosition,
  recorded: AppointmentPaymentAmounts,
  amounts: AppointmentPaymentAmounts,
): AppointmentCheckoutRefusal | undefined {
  return validatePaymentWithinBounds(getPaymentCorrectionBounds(position, recorded), amounts);
}

/** Whether `amounts` may be recorded as the FIRST final payment of the Appointment. */
export function validateAppointmentCheckoutAmounts(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
  amounts: AppointmentPaymentAmounts,
): AppointmentCheckoutRefusal | undefined {
  if (appointment.payment !== undefined) return 'ALREADY_SETTLED';
  return validateCheckoutAmounts(getAppointmentDepositPosition(appointment, sales, deposits), amounts);
}

/** Whether `amounts` may replace the recorded final payment of the Appointment. */
export function validateAppointmentPaymentCorrection(
  appointment: Appointment,
  sales: readonly Sale[],
  deposits: readonly AppointmentDeposit[],
  amounts: AppointmentPaymentAmounts,
): AppointmentCheckoutRefusal | undefined {
  if (appointment.payment === undefined) return 'NO_PAYMENT';
  return validatePaymentCorrectionAmounts(
    getAppointmentDepositPosition(appointment, sales, deposits),
    appointment.payment,
    amounts,
  );
}

/**
 * « Encaissé le » — TODAY is `now`; APPOINTMENT_DAY is the local day of the
 * Appointment, offered only for the first payment of an earlier day.
 */
export type AppointmentPaymentDate = 'APPOINTMENT_DAY' | 'TODAY';

/** The date choice is offered for the FIRST final payment of an Appointment of an earlier local day. */
export function canChooseAppointmentPaymentDate(
  appointment: Pick<Appointment, 'startAt' | 'payment'>,
  now: Date,
): boolean {
  return appointment.payment === undefined && isPreviousLocalDay(appointment.startAt, now);
}

/**
 * The instant a payment dated « Jour du rendez-vous » carries: the end of the
 * Appointment (its timeline, processing included), or 23:59 of its local day
 * when the Appointment runs past local midnight. Built from local calendar
 * fields, so the Cash Register's local-day grouping always places it on the
 * appointment day — never shifted by UTC or a DST change.
 */
export function getAppointmentDayPaymentInstant(appointment: Appointment): Date {
  const { startAt } = appointment;
  const endAt = getAppointmentEndAt(appointment);
  const sameLocalDay =
    endAt.getFullYear() === startAt.getFullYear() &&
    endAt.getMonth() === startAt.getMonth() &&
    endAt.getDate() === startAt.getDate();
  if (sameLocalDay) return endAt;
  return new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), 23, 59, 0, 0);
}

/** THE `paidAt` of a new final payment for the chosen date. */
export function getAppointmentPaymentInstant(
  appointment: Appointment,
  paymentDate: AppointmentPaymentDate,
  now: Date,
): Date {
  if (paymentDate === 'APPOINTMENT_DAY' && canChooseAppointmentPaymentDate(appointment, now)) {
    return getAppointmentDayPaymentInstant(appointment);
  }
  return new Date(now.getTime());
}
