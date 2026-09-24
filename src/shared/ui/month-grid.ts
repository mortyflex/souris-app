// Souris — month grid
//
// The local civil days shown by the shared MonthCalendarSheet: six
// Monday-first weeks around one month, real adjacent-month days included.
// Pure date arithmetic on the device-local calendar, never UTC.

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

export function isSameLocalDate(a: Date, b: Date): boolean {
  return isSameLocalMonth(a, b) && a.getDate() === b.getDate();
}

/**
 * The real local days shown by the calendar of `month`, Monday first: the
 * leading days of the previous month, the month itself, then the trailing
 * days of the next month up to six full weeks.
 */
export function getMonthGridDays(month: Date): readonly Date[] {
  const first = startOfLocalMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: MONTH_GRID_DAY_COUNT },
    (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset + index),
  );
}
