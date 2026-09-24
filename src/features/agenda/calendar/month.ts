import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { addLocalDays, getLocalDateKey, getStartOfWeek } from './week';

/** Six Monday-first weeks: every month fits, and the grid never changes height. */
export const MONTH_GRID_DAY_COUNT = 42;

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addLocalMonths(month: Date, amount: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1);
}

export function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * The real local days shown by the calendar of `month`, Monday first: the
 * leading days of the previous month, the month itself, then the trailing
 * days of the next month up to six full weeks.
 */
export function getMonthGridDays(month: Date): readonly Date[] {
  const firstMonday = getStartOfWeek(startOfLocalMonth(month));
  return Array.from({ length: MONTH_GRID_DAY_COUNT }, (_, index) => addLocalDays(firstMonday, index));
}

/**
 * The local days holding at least one of `entries`, keyed like the Agenda
 * day filter (`getLocalDateKey`), so the calendar and the Day view always
 * agree on which day an Appointment belongs to. The caller decides which
 * entries count (the Agenda passes its operational entries).
 */
export function getAppointmentDayKeys(entries: readonly AppointmentSessionEntry[]): ReadonlySet<string> {
  return new Set(entries.map(({ appointment }) => getLocalDateKey(appointment.startAt)));
}
