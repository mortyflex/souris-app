// Souris — Cash Register derivation
//
// The Cash Register ("Caisse") derives ONLY from money explicitly recorded
// through Souris:
//
//   A. Appointment checkouts          appointment.payment
//   B. standalone Sale payments       sale.payment where sale.appointmentId is undefined
//
// A Sale sold during an Appointment (« Revente ») is never counted on its
// own: the Appointment checkout already records the whole amount received,
// so counting the Sale too would double count. Status alone, the Client
// « Total dépensé » metric, and Sale snapshot totals contribute nothing.
// Every value is derived on demand; nothing is ever stored.
//
// Grouping uses each payment's own `paidAt` in the DEVICE-LOCAL civil
// calendar (year / month / day as seen by the local clock), never a UTC
// date substring, so a checkout recorded near midnight lands on the day the
// professional lived.

import type { Appointment } from '../appointments';
import type { Sale } from '../sales';

export interface CashRegisterSummary {
  readonly totalCents: number;
  readonly cardCents: number;
  readonly cashCents: number;
  readonly checkoutCount: number;
}

export interface CashRegisterSources {
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
}

export const EMPTY_CASH_REGISTER_SUMMARY: CashRegisterSummary = {
  totalCents: 0,
  cardCents: 0,
  cashCents: 0,
  checkoutCount: 0,
};

export interface RecordedPayment {
  readonly paidAt: Date;
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * One counted payment together with what recorded it: an Appointment
 * checkout or a standalone Sale. Read-only view over the same selection
 * as the totals, so a listed entry is always an entry the totals count.
 */
export type CashRegisterEntry =
  | {
      readonly kind: 'APPOINTMENT';
      readonly payment: RecordedPayment;
      readonly appointment: Appointment;
    }
  | {
      readonly kind: 'SALE';
      readonly payment: RecordedPayment;
      readonly sale: Sale;
    };

/** Every entry the Cash Register may count, in source order. */
function getCashRegisterEntries(sources: CashRegisterSources): readonly CashRegisterEntry[] {
  const entries: CashRegisterEntry[] = [];
  for (const appointment of sources.appointments) {
    if (appointment.payment) {
      entries.push({ kind: 'APPOINTMENT', payment: appointment.payment, appointment });
    }
  }
  for (const sale of sources.sales) {
    if (sale.payment && sale.appointmentId === undefined) {
      entries.push({ kind: 'SALE', payment: sale.payment, sale });
    }
  }
  return entries;
}

/** Every payment the Cash Register may count, in source order. */
export function getCashRegisterPayments(sources: CashRegisterSources): readonly RecordedPayment[] {
  return getCashRegisterEntries(sources).map((entry) => entry.payment);
}

/** The counted entries of one period, oldest payment first. */
function listEntries(
  sources: CashRegisterSources,
  includes: (paidAt: Date) => boolean,
): readonly CashRegisterEntry[] {
  return getCashRegisterEntries(sources)
    .filter((entry) => includes(entry.payment.paidAt))
    .sort((a, b) => a.payment.paidAt.getTime() - b.payment.paidAt.getTime());
}

/** Entries paid on ONE local civil day, oldest first — exactly what the day summary counts. */
export function getCashRegisterDayEntries(
  sources: CashRegisterSources,
  day: Date,
): readonly CashRegisterEntry[] {
  return listEntries(sources, (paidAt) => isSameLocalDay(paidAt, day));
}

/** Entries paid during ONE local calendar month, oldest first — exactly what the month summary counts. */
export function getCashRegisterMonthEntries(
  sources: CashRegisterSources,
  month: Date,
): readonly CashRegisterEntry[] {
  return listEntries(sources, (paidAt) => isSameLocalMonth(paidAt, month));
}

function summarize(
  sources: CashRegisterSources,
  includes: (paidAt: Date) => boolean,
): CashRegisterSummary {
  let cardCents = 0;
  let cashCents = 0;
  let checkoutCount = 0;

  for (const payment of getCashRegisterPayments(sources)) {
    if (!includes(payment.paidAt)) continue;
    cardCents += payment.cardAmountCents;
    cashCents += payment.cashAmountCents;
    checkoutCount += 1;
  }

  return { totalCents: cardCents + cashCents, cardCents, cashCents, checkoutCount };
}

/** Money received on ONE local civil day (the day `day` falls on). */
export function getCashRegisterDaySummary(
  sources: CashRegisterSources,
  day: Date,
): CashRegisterSummary {
  return summarize(sources, (paidAt) => isSameLocalDay(paidAt, day));
}

/** Money received during ONE local calendar month (the month `month` falls in). */
export function getCashRegisterMonthSummary(
  sources: CashRegisterSources,
  month: Date,
): CashRegisterSummary {
  return summarize(sources, (paidAt) => isSameLocalMonth(paidAt, month));
}
