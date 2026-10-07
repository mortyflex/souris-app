// BeautIzzy — Insights periods (pure)
//
// The civil periods « Tops & tendances » reads, in the DEVICE-LOCAL calendar:
//
//   DAY    the anchor's calendar day
//   WEEK   Monday → Sunday containing the anchor (French convention)
//   MONTH  the calendar month containing the anchor
//   YEAR   the calendar year containing the anchor
//
// A period is `[start, end)`: `start` is a local midnight included, `end` the
// local midnight right after the period, excluded. Every boundary is built
// with the local `Date` constructor from year / month / day, never from a UTC
// string or a fixed number of milliseconds, so a DST change or a payment at
// 23:59 never moves an event into the neighbouring period.

export type InsightsPeriodKind = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface InsightsPeriod {
  readonly kind: InsightsPeriodKind;
  /** First local midnight of the period (included). */
  readonly start: Date;
  /** Local midnight right after the period (excluded). */
  readonly end: Date;
}

function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

/** Monday of the local week containing `date`. */
function startOfLocalWeek(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return localDate(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
}

export function getInsightsPeriod(kind: InsightsPeriodKind, anchor: Date): InsightsPeriod {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const day = anchor.getDate();
  switch (kind) {
    case 'DAY':
      return { kind, start: localDate(year, month, day), end: localDate(year, month, day + 1) };
    case 'WEEK': {
      const monday = startOfLocalWeek(anchor);
      return {
        kind,
        start: monday,
        end: localDate(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7),
      };
    }
    case 'MONTH':
      return { kind, start: localDate(year, month, 1), end: localDate(year, month + 1, 1) };
    case 'YEAR':
      return { kind, start: localDate(year, 0, 1), end: localDate(year + 1, 0, 1) };
  }
}

/** `start <= date < end`. */
export function isWithinInsightsPeriod(period: InsightsPeriod, date: Date): boolean {
  const time = date.getTime();
  return time >= period.start.getTime() && time < period.end.getTime();
}

/** Same day of month `months` later, clamped to the last day (31 janv. + 1 mois → 28/29 févr.). */
function shiftLocalMonthsClamped(date: Date, months: number): Date {
  const firstOfTarget = localDate(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = localDate(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  return localDate(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(date.getDate(), lastDay));
}

/**
 * The anchor moved by exactly `amount` periods of `kind`: ±1 day, ±1 week,
 * ±1 month, ±1 year. The day of the anchor is kept wherever it exists, so
 * switching the period kind afterwards stays around the same date.
 * Returns a local midnight.
 */
export function shiftInsightsAnchor(kind: InsightsPeriodKind, anchor: Date, amount: number): Date {
  switch (kind) {
    case 'DAY':
      return localDate(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + amount);
    case 'WEEK':
      return localDate(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + amount * 7);
    case 'MONTH':
      return shiftLocalMonthsClamped(anchor, amount);
    case 'YEAR':
      return shiftLocalMonthsClamped(anchor, amount * 12);
  }
}
