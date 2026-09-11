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
