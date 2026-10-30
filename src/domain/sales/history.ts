// BeautIzzy — Sale history (pure)
//
// Source: docs/domain/SALES.md §11b
//
// The read-only history of Product Sales shown from the Caisse « Produits
// vendus » card: which Sales were completed over a period, how each one was
// sold and how its money was recorded. Everything is DERIVED from the Sale
// snapshots and the recorded payment; nothing is stored, nothing is
// reinterpreted from the current Product catalog, and no field that was
// never recorded is invented:
//
//   channel        DIRECT       a standalone Sale (Produits → Nouvelle vente)
//                  APPOINTMENT  a Sale sold during an Appointment (« Revente »)
//   paymentRecord  SALE_PAYMENT          the Sale carries its own card / cash record
//                  APPOINTMENT_CHECKOUT  the Appointment checkout records that money
//                  NONE                  a historical standalone Sale without any
//                                        payment record — nothing is fabricated
//
// A Sale belongs to the period of its own `completedAt` (the instant the Sale
// was validated), the same instant the Caisse « Produits vendus » card counts
// its units on. The period is a device-local civil interval `[start, end)`
// built by the caller (the Caisse day / month helpers).

import { getSaleTotalCents } from '../appointments/expected-total';
import { getSaleUnitCount } from './sale';
import type { Sale } from './types';

export type SaleChannel = 'DIRECT' | 'APPOINTMENT';

export type SalePaymentRecord = 'SALE_PAYMENT' | 'APPOINTMENT_CHECKOUT' | 'NONE';

/** `[start, end)`: `start` included, `end` excluded — local civil bounds built by the caller. */
export interface SaleHistoryInterval {
  readonly start: Date;
  readonly end: Date;
}

/** One Sale as the history reads it: the Sale itself plus its derived facts. */
export interface SaleHistoryEntry {
  readonly sale: Sale;
  readonly channel: SaleChannel;
  readonly paymentRecord: SalePaymentRecord;
  /** Σ snapshot lines, exact integer cents (`getSaleTotalCents`). */
  readonly totalCents: number;
  /** Total units across every line. */
  readonly unitCount: number;
}

/** How the Sale was sold, from the stored Appointment reference alone. */
export function getSaleChannel(sale: Pick<Sale, 'appointmentId'>): SaleChannel {
  return sale.appointmentId === undefined ? 'DIRECT' : 'APPOINTMENT';
}

/**
 * How the money of the Sale was recorded. A Sale sold during an Appointment
 * never carries a payment (docs/domain/SALES.md §4b): its money is the
 * Appointment checkout's. A standalone Sale without a payment is a
 * historical record whose method was never known.
 */
export function getSalePaymentRecord(sale: Pick<Sale, 'appointmentId' | 'payment'>): SalePaymentRecord {
  if (sale.appointmentId !== undefined) return 'APPOINTMENT_CHECKOUT';
  return sale.payment === undefined ? 'NONE' : 'SALE_PAYMENT';
}

export function describeSaleHistoryEntry(sale: Sale): SaleHistoryEntry {
  return {
    sale,
    channel: getSaleChannel(sale),
    paymentRecord: getSalePaymentRecord(sale),
    totalCents: getSaleTotalCents(sale),
    unitCount: getSaleUnitCount(sale),
  };
}

function isWithin(interval: SaleHistoryInterval, date: Date): boolean {
  const time = date.getTime();
  return time >= interval.start.getTime() && time < interval.end.getTime();
}

/**
 * The Sales completed during the interval, NEWEST first (ties broken by id so
 * the order is stable). The source array is never mutated.
 */
export function listSaleHistory(
  sales: readonly Sale[],
  interval: SaleHistoryInterval,
): readonly SaleHistoryEntry[] {
  return sales
    .filter((sale) => isWithin(interval, sale.completedAt))
    .sort(
      (a, b) =>
        b.completedAt.getTime() - a.completedAt.getTime() || b.id.localeCompare(a.id),
    )
    .map(describeSaleHistoryEntry);
}

/** The Sale with that id, as the history reads it; undefined when it does not exist. */
export function findSaleHistoryEntry(
  sales: readonly Sale[],
  saleId: string | undefined,
): SaleHistoryEntry | undefined {
  if (saleId === undefined) return undefined;
  const sale = sales.find((candidate) => candidate.id === saleId);
  return sale === undefined ? undefined : describeSaleHistoryEntry(sale);
}

export interface SaleHistorySummary {
  readonly saleCount: number;
  readonly unitCount: number;
  /** Units of DIRECT Sales. */
  readonly directUnitCount: number;
  /** Units of Sales sold during an Appointment. */
  readonly appointmentUnitCount: number;
}

/** What the listed period sold, in ONE pass over the listed entries. */
export function summarizeSaleHistory(entries: readonly SaleHistoryEntry[]): SaleHistorySummary {
  let directUnitCount = 0;
  let appointmentUnitCount = 0;
  for (const entry of entries) {
    if (entry.channel === 'DIRECT') directUnitCount += entry.unitCount;
    else appointmentUnitCount += entry.unitCount;
  }
  return {
    saleCount: entries.length,
    unitCount: directUnitCount + appointmentUnitCount,
    directUnitCount,
    appointmentUnitCount,
  };
}
