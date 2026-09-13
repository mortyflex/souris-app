// Souris — SQLite value mapping helpers
//
// The only place where SQLite representations (0/1 booleans, ISO instants,
// NULL optionals) are converted. Canonical domain values never see them.

import type { SqlValue } from './database';

export function toSqlBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export function fromSqlBoolean(value: number): boolean {
  return value === 1;
}

/** Instants (Appointment startAt, cancelledAt, recordedAt, completedAt) are stored as ISO-8601 UTC strings. */
export function toSqlInstant(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('toSqlInstant: invalid Date');
  }
  return value.toISOString();
}

export function fromSqlInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`fromSqlInstant: invalid stored instant "${value}"`);
  }
  return date;
}

/** Optional canonical text ↔ NULL. Never coerces to empty strings. */
export function toSqlOptional(value: string | undefined): SqlValue {
  return value === undefined ? null : value;
}

export function fromSqlOptional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * Recorded payment (Appointment checkout, standalone Sale) ↔ the three
 * nullable columns `paid_at`, `card_amount_cents`, `cash_amount_cents`. A
 * payment exists only when `paid_at` is set; historical rows hydrate to no
 * payment at all. Amounts are exact non-negative integer cents.
 */
export interface PaymentColumns {
  readonly paid_at: string | null;
  readonly card_amount_cents: number | null;
  readonly cash_amount_cents: number | null;
}

export interface RecordedPayment {
  readonly paidAt: Date;
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}

export function assertAmountCents(value: number, column: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${column} must be a non-negative integer number of cents, got ${value}`);
  }
  return value;
}

export function toSqlPaymentColumns(
  payment: RecordedPayment | undefined,
): readonly [SqlValue, SqlValue, SqlValue] {
  if (!payment) return [null, null, null];
  return [
    toSqlInstant(payment.paidAt),
    assertAmountCents(payment.cardAmountCents, 'card_amount_cents'),
    assertAmountCents(payment.cashAmountCents, 'cash_amount_cents'),
  ];
}

export function fromSqlPaymentColumns(row: PaymentColumns): RecordedPayment | undefined {
  if (row.paid_at === null) return undefined;
  return {
    paidAt: fromSqlInstant(row.paid_at),
    cardAmountCents: row.card_amount_cents ?? 0,
    cashAmountCents: row.cash_amount_cents ?? 0,
  };
}
