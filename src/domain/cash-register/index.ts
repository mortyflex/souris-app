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

interface RecordedPayment {
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

/** Every payment the Cash Register may count, in source order. */
export function getCashRegisterPayments(sources: CashRegisterSources): readonly RecordedPayment[] {
  const payments: RecordedPayment[] = [];
  for (const appointment of sources.appointments) {
    if (appointment.payment) payments.push(appointment.payment);
  }
  for (const sale of sources.sales) {
    if (sale.payment && sale.appointmentId === undefined) payments.push(sale.payment);
  }
  return payments;
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
