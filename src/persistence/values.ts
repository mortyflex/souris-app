// Souris — SQLite value mapping helpers
//
// The only place where SQLite representations (0/1 booleans, ISO instants,
// NULL optionals, integer cents) are converted. Canonical domain values
// never see them.

import {
  eurosToCents,
  isValidAppointmentDiscount,
  type AppointmentDiscount,
} from '@/domain/appointments';

import type { SqlValue } from './database';

export function toSqlBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export function fromSqlBoolean(value: number): boolean {
  return value === 1;
}

/** Optional canonical boolean ↔ nullable 0/1 column. NULL means "absent property". */
export function toSqlOptionalBoolean(value: boolean | undefined): SqlValue {
  return value === undefined ? null : toSqlBoolean(value);
}

export function fromSqlOptionalBoolean(value: number | null): boolean | undefined {
  return value === null ? undefined : fromSqlBoolean(value);
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

/**
 * Catalog and snapshot prices (`services.price_cents`, `products.price_cents`,
 * `appointment_items.price_cents`, `sale_items.unit_price_cents`) are stored
 * as exact non-negative INTEGER cents since schema v8; the domain keeps its
 * euro-number contract (`price`, `unitPrice`). These two functions are the
 * ONLY conversion between the two: writes go through the domain rounding
 * rule, reads divide an integer by 100, which is exact for any amount that
 * is meaningful at two decimals — a stored value round-trips unchanged.
 */
export function toSqlPriceCents(euros: number, column: string): number {
  if (!Number.isFinite(euros) || euros < 0) {
    throw new RangeError(`${column} must be a finite non-negative euro amount, got ${euros}`);
  }
  return assertAmountCents(eurosToCents(euros), column);
}

export function fromSqlPriceCents(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`fromSqlPriceCents: stored value ${cents} is not a non-negative integer number of cents`);
  }
  return cents / 100;
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

/**
 * The Appointment discount columns (schema v10): at most ONE is set. Both
 * NULL — every row written before the columns existed — is "no discount".
 */
export interface DiscountColumns {
  readonly discount_percent: number | null;
  readonly discount_amount_cents: number | null;
}

export function fromSqlDiscountColumns(row: DiscountColumns): AppointmentDiscount | undefined {
  if (row.discount_percent !== null) return { type: 'PERCENT', percent: row.discount_percent };
  if (row.discount_amount_cents !== null) {
    return { type: 'FIXED', amountCents: row.discount_amount_cents };
  }
  return undefined;
}

/** `[discount_percent, discount_amount_cents]`; an invalid discount never reaches SQLite. */
export function toSqlDiscountColumns(
  discount: AppointmentDiscount | undefined,
): readonly [number | null, number | null] {
  if (!discount) return [null, null];
  if (!isValidAppointmentDiscount(discount)) {
    throw new RangeError(`appointments: invalid ${discount.type} discount`);
  }
  return discount.type === 'PERCENT' ? [discount.percent, null] : [null, discount.amountCents];
}
