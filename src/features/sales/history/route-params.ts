// BeautIzzy — sale history route parameters
//
// The Caisse opens the sale history on the period it is showing: `/sales`
// carries `period` (`day` | `month`) and `date` (`YYYY-MM-DD`, the Caisse day
// key of the selected day or of the 1st of the selected month). Both are
// optional and tolerant: anything unreadable falls back to today in Day mode,
// so a stale or hand-typed link never breaks the screen.

import { getCashRegisterDayKey } from '@/domain/cash-register';
import { startOfLocalDay, type CashRegisterPeriod } from '@/features/cash-register/presentation';

export interface SaleHistoryRouteParams {
  readonly period?: string;
  readonly date?: string;
}

export interface SaleHistoryInitialState {
  readonly period: CashRegisterPeriod;
  /** Local midnight of the selected day (Day) or of the 1st of the month (Month). */
  readonly date: Date;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The civil `YYYY-MM-DD` key as a local midnight, or undefined when it is not a real date. */
export function parseSaleHistoryDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const match = DAY_KEY.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // A rolled-over value (e.g. 2026-02-31) is not the date that was written.
  return getCashRegisterDayKey(date) === value ? date : undefined;
}

export function resolveSaleHistoryInitialState(
  params: SaleHistoryRouteParams,
  now: Date,
): SaleHistoryInitialState {
  const period: CashRegisterPeriod = params.period === 'month' ? 'month' : 'day';
  const date = parseSaleHistoryDate(params.date) ?? startOfLocalDay(now);
  return { period, date };
}

/** The params the Caisse pushes for the period it is showing. */
export function toSaleHistoryRouteParams(period: CashRegisterPeriod, date: Date): {
  readonly period: CashRegisterPeriod;
  readonly date: string;
} {
  return { period, date: getCashRegisterDayKey(date) };
}
