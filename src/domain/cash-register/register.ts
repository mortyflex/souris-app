// BeautIzzy — Cash Register derivation
//
// The Cash Register ("Caisse") derives ONLY from money explicitly recorded
// through BeautIzzy:
//
//   A. Appointment checkouts          appointment.payment — the money received at the
//                                     FINAL checkout only (deposits already received
//                                     are never recorded again there)
//   B. standalone Sale payments       sale.payment where sale.appointmentId is undefined
//   C. Appointment deposits           ACTIVE deposits, on their own `paidAt` — the day
//                                     the money was received, never the Appointment day.
//                                     A VOIDED deposit is a corrected entry: it counts
//                                     nowhere (V1 has no refund-date accounting)
//   D. SETTLED Sale adjustments       money given back for a Sale (a refund: NEGATIVE)
//                                     or a compensating reversal (POSITIVE), on its own
//                                     `refundedAt` — the day it actually happened, never
//                                     the Sale day (docs/domain/SALES.md §15). PENDING
//                                     and VOIDED move nothing. Direct Sales and Reventes
//                                     alike: the Revente money stays in its Appointment
//                                     payment, the refund is the one separate movement
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

import {
  isActiveAppointmentDeposit,
  type Appointment,
  type AppointmentDeposit,
} from '../appointments';
import { getSaleAdjustmentCashMovement, type Sale, type SaleAdjustment } from '../sales';

/**
 * What one period collected, NET of the Sale refunds settled in it: every
 * amount is the sum of receipts and of the signed adjustment movements, so a
 * day with only a refund reads negative. `checkoutCount` counts receipts only.
 */
export interface CashRegisterSummary {
  readonly totalCents: number;
  readonly cardCents: number;
  readonly cashCents: number;
  readonly checkoutCount: number;
}

export interface CashRegisterSources {
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
  /** Every Appointment deposit; only ACTIVE ones are counted. Absent = none. */
  readonly deposits?: readonly AppointmentDeposit[];
  /** Every Sale adjustment; only SETTLED ones move money. Absent = none. */
  readonly saleAdjustments?: readonly SaleAdjustment[];
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
    }
  | {
      readonly kind: 'DEPOSIT';
      readonly payment: RecordedPayment;
      readonly deposit: AppointmentDeposit;
      /** The Appointment the deposit was paid for (undefined only if it is not loaded). */
      readonly appointment: Appointment | undefined;
    }
  | {
      /**
       * A SETTLED refund (negative amounts) or reversal (positive amounts) of a
       * Sale. Never an « encaissement »: it counts in the totals and the method
       * breakdown, not in the count of payments or of paying clients.
       */
      readonly kind: 'SALE_ADJUSTMENT';
      readonly payment: RecordedPayment;
      readonly adjustment: SaleAdjustment;
      /** The adjusted Sale (undefined only if it is not loaded). */
      readonly sale: Sale | undefined;
    };

/** A deposit as the money it is: its whole amount on its one method. */
function toRecordedPayment(deposit: AppointmentDeposit): RecordedPayment {
  return {
    paidAt: deposit.paidAt,
    cardAmountCents: deposit.paymentMethod === 'CARD' ? deposit.amountCents : 0,
    cashAmountCents: deposit.paymentMethod === 'CASH' ? deposit.amountCents : 0,
  };
}

/** Every entry the Cash Register may count, in source order (shared with `comparison.ts`). */
export function getCashRegisterEntries(sources: CashRegisterSources): readonly CashRegisterEntry[] {
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
  const deposits = sources.deposits ?? [];
  if (deposits.length > 0) {
    const appointmentsById = new Map(sources.appointments.map((appointment) => [appointment.id, appointment]));
    for (const deposit of deposits) {
      if (!isActiveAppointmentDeposit(deposit)) continue;
      entries.push({
        kind: 'DEPOSIT',
        payment: toRecordedPayment(deposit),
        deposit,
        appointment: appointmentsById.get(deposit.appointmentId),
      });
    }
  }
  const adjustments = sources.saleAdjustments ?? [];
  if (adjustments.length > 0) {
    const salesById = new Map(sources.sales.map((sale) => [sale.id, sale]));
    for (const adjustment of adjustments) {
      const movement = getSaleAdjustmentCashMovement(adjustment);
      if (!movement) continue;
      entries.push({
        kind: 'SALE_ADJUSTMENT',
        payment: { paidAt: movement.at, cardAmountCents: movement.cardCents, cashAmountCents: movement.cashCents },
        adjustment,
        sale: salesById.get(adjustment.saleId),
      });
    }
  }
  return entries;
}

/** Whether the entry is money received (an « encaissement »), not a refund or a reversal. */
export function isCashRegisterReceipt(entry: CashRegisterEntry): boolean {
  return entry.kind !== 'SALE_ADJUSTMENT';
}

/**
 * The identified client whose money an entry records: the Appointment's
 * client for a checkout or a deposit, the Sale's client for a standalone
 * Sale. Undefined for a walk-in Sale and for a deposit whose Appointment is
 * not loaded — such money is counted, but it identifies nobody.
 */
export function getCashRegisterEntryClientId(entry: CashRegisterEntry): string | undefined {
  if (entry.kind === 'SALE_ADJUSTMENT') return entry.sale?.clientId;
  return entry.kind === 'SALE' ? entry.sale.clientId : entry.appointment?.clientId;
}

/**
 * How many DISTINCT identified clients the entries' money came from, by
 * stable client id — never by name or phone. A client who paid several
 * times over the period (a checkout, a deposit, a standalone Sale) counts
 * once; an entry without a client counts nobody. Give it the entries of the
 * period (`getCashRegisterDayEntries` / `getCashRegisterMonthEntries`): the
 * count then covers exactly the payments the period's totals count — a
 * VOIDED deposit, an unpaid Sale or a Sale sold during an Appointment never
 * reach it.
 */
export function countCashRegisterPayingClients(entries: readonly CashRegisterEntry[]): number {
  const clientIds = new Set<string>();
  for (const entry of entries) {
    // A refund identifies a client but brings no money in.
    if (!isCashRegisterReceipt(entry)) continue;
    const clientId = getCashRegisterEntryClientId(entry);
    if (clientId !== undefined) clientIds.add(clientId);
  }
  return clientIds.size;
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

  for (const entry of getCashRegisterEntries(sources)) {
    const { payment } = entry;
    if (!includes(payment.paidAt)) continue;
    cardCents += payment.cardAmountCents;
    cashCents += payment.cashAmountCents;
    if (isCashRegisterReceipt(entry)) checkoutCount += 1;
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

/**
 * A span of time as `[start, end)`: `start` included, `end` excluded. Built
 * from device-local civil boundaries (local midnights) by the caller.
 */
export interface CashRegisterInterval {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Money received during ANY local span (a week, a year…): the same payment
 * selection and arithmetic as the day and month summaries, with the bounds
 * `start <= paidAt < end`.
 */
export function getCashRegisterIntervalSummary(
  sources: CashRegisterSources,
  interval: CashRegisterInterval,
): CashRegisterSummary {
  const start = interval.start.getTime();
  const end = interval.end.getTime();
  return summarize(sources, (paidAt) => paidAt.getTime() >= start && paidAt.getTime() < end);
}

/**
 * `2026-09-23`: the local civil day a payment belongs to — the same
 * device-local year / month / day as `getCashRegisterDaySummary`, never a
 * UTC date substring.
 */
export function getCashRegisterDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Money received per local civil day, keyed by `getCashRegisterDayKey`, in
 * ONE pass over the counted payments: the same selection and arithmetic as
 * the day summary, so `get(key)` always equals that day's `totalCents`.
 * Days without any counted payment are absent.
 */
export function getCashRegisterDailyTotals(sources: CashRegisterSources): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const payment of getCashRegisterPayments(sources)) {
    const key = getCashRegisterDayKey(payment.paidAt);
    totals.set(key, (totals.get(key) ?? 0) + payment.cardAmountCents + payment.cashAmountCents);
  }
  return totals;
}

/** The Sale refunds and reversals SETTLED in one period, apart from the receipts. */
export interface CashRegisterRefundSummary {
  /** Money given back, net of reversals: positive when money left. */
  readonly refundCents: number;
  readonly refundCardCents: number;
  readonly refundCashCents: number;
  /** Of `refundCents`: refunds of Sales sold during an Appointment. */
  readonly appointmentRefundCents: number;
  /** Receipts before refunds: `totalCents + refundCents`. */
  readonly grossCents: number;
  readonly count: number;
}

/** The refunds of `[start, end)` and the gross receipts they come off. */
export function getCashRegisterRefundSummary(
  sources: CashRegisterSources,
  interval: CashRegisterInterval,
): CashRegisterRefundSummary {
  const start = interval.start.getTime();
  const end = interval.end.getTime();
  let refundCardCents = 0;
  let refundCashCents = 0;
  let appointmentRefundCents = 0;
  let grossCents = 0;
  let count = 0;
  for (const entry of getCashRegisterEntries(sources)) {
    const time = entry.payment.paidAt.getTime();
    if (time < start || time >= end) continue;
    if (entry.kind !== 'SALE_ADJUSTMENT') {
      grossCents += entry.payment.cardAmountCents + entry.payment.cashAmountCents;
      continue;
    }
    count += 1;
    refundCardCents -= entry.payment.cardAmountCents;
    refundCashCents -= entry.payment.cashAmountCents;
    if (entry.sale?.appointmentId !== undefined) {
      appointmentRefundCents -= entry.payment.cardAmountCents + entry.payment.cashAmountCents;
    }
  }
  return {
    refundCents: refundCardCents + refundCashCents,
    refundCardCents,
    refundCashCents,
    appointmentRefundCents,
    grossCents,
    count,
  };
}
