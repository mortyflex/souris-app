// BeautIzzy — Cash Register period comparisons (pure)
//
// The Caisse month view may say how the collected total compares with an
// EQUIVALENT earlier period. Every figure here reads THE Cash Register
// selection (`register.ts`) — the same payments, the same arithmetic — over
// explicit `[start, end)` windows built in the device-local civil calendar.
// Nothing is stored, projected or forecast.
//
// Windows
//
//   current, unfinished month   the whole month — a payment is never dated in the
//                               future, so this is the month TO DATE and exactly
//                               the total the card shows — against the SAME
//                               elapsed span of the reference month: [1st, same day
//                               of month at the same local time). No window when
//                               the reference month has no such day (the 31st
//                               against a 30-day month, a 29 February against a
//                               non-leap year): a month to date is never compared
//                               with a whole month.
//   completed month             the whole month against the whole reference month.
//   future month                nothing to compare.
//
// References: the previous month (primary) and the same month of the previous
// year (secondary). Year transitions follow the local `Date` constructor.
//
// Coverage
//
// A comparison is only offered when the reference window is COVERED by the
// recorded history: the earliest recorded activity (an Appointment start, a
// Sale completion, a payment, a deposit) is on or before the window's first
// day. An empty earlier period is a real zero only when BeautIzzy was already
// recording then; before that it proves nothing and no trend is shown.
//
// Trend
//
//   direction   UP / DOWN / FLAT by exact comparison of the two values
//   ratio       (current − previous) / previous — undefined when previous is 0,
//               so a zero reference never divides, never yields Infinity
//   no trend    when both values are 0: nothing to compare on either side
//
// Availability
//
// The month-over-month comparison of the collected total is reported as ONE
// explicit outcome (`CashRegisterComparisonOutcome`): AVAILABLE with its trend
// (a zero reference included — the trend then carries no ratio), or UNAVAILABLE
// with the one reason that stopped it, checked in this order:
//
//   FUTURE_MONTH          the month has not begun
//   NO_EQUIVALENT_SPAN    the reference month has no such elapsed day
//   HISTORY_NOT_COVERED   the history begins after the reference span's first day
//   NOTHING_TO_COMPARE    both spans collected nothing
//
// so the screen explains a missing comparison from this reason and never
// re-derives availability from the figures.
//
// Products
//
//   units                Σ quantities of the Sale lines completed in the window
//                        (`completedAt`), standalone Sales AND Sales sold during
//                        an Appointment (« Revente »), each line once — quantities,
//                        never the number of Sales
//   direct sales cents   Σ payments of the STANDALONE Sales paid in the window:
//                        exactly the Caisse « Vente » entries. Products sold
//                        during an Appointment are paid inside its checkout, and
//                        that checkout records ONE amount for services and
//                        products together — no trustworthy split exists, so no
//                        product amount is ever derived from it.

import {
  getCashRegisterEntries,
  getCashRegisterIntervalSummary,
  type CashRegisterInterval,
  type CashRegisterSources,
} from './register';

export type CashRegisterComparisonReference = 'PREVIOUS_MONTH' | 'PREVIOUS_YEAR';

export interface CashRegisterComparison {
  readonly reference: CashRegisterComparisonReference;
  /** True when the reference window stops at the elapsed day and time (month to date). */
  readonly elapsed: boolean;
  readonly current: CashRegisterInterval;
  readonly previous: CashRegisterInterval;
}

export type CashRegisterTrendDirection = 'UP' | 'DOWN' | 'FLAT';

export interface CashRegisterTrend {
  readonly direction: CashRegisterTrendDirection;
  readonly current: number;
  readonly previous: number;
  /** current − previous, in the unit of the compared values. */
  readonly delta: number;
  /** delta / previous (0.124 = +12,4 %); undefined when `previous` is 0. */
  readonly ratio: number | undefined;
  readonly comparison: CashRegisterComparison;
}

export interface CashRegisterProductSummary {
  /** Units of every Sale line completed in the window. */
  readonly unitCount: number;
  /** Units of standalone Sales (sold from Produits). */
  readonly standaloneUnitCount: number;
  /** Units of Sales sold during an Appointment (« Revente »). */
  readonly appointmentUnitCount: number;
  /** Money received for standalone Sales in the window — the Caisse « Vente » entries. */
  readonly standaloneCollectedCents: number;
}

/** Why a month-over-month comparison is not offered (see the header, « Availability »). */
export type CashRegisterComparisonUnavailableReason =
  | 'FUTURE_MONTH'
  | 'NO_EQUIVALENT_SPAN'
  | 'HISTORY_NOT_COVERED'
  | 'NOTHING_TO_COMPARE';

export type CashRegisterComparisonOutcome =
  | { readonly status: 'AVAILABLE'; readonly trend: CashRegisterTrend }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason: CashRegisterComparisonUnavailableReason;
      readonly reference: CashRegisterComparisonReference;
      /** Local midnight of the 1st of the compared month. */
      readonly month: Date;
      /** Local midnight of the 1st of the reference month it could not be compared with. */
      readonly referenceMonth: Date;
    };

export interface CashRegisterMonthInsights {
  /** Collected total against the equivalent window of the previous month, or why not. */
  readonly cashComparison: CashRegisterComparisonOutcome;
  /** The trend of `cashComparison` when it is available — the same object. */
  readonly cashTrend: CashRegisterTrend | undefined;
  /** Collected total against the equivalent window of the same month a year earlier. */
  readonly cashYearTrend: CashRegisterTrend | undefined;
  readonly products: CashRegisterProductSummary;
  /** Product units against the equivalent window of the previous month. */
  readonly productUnitTrend: CashRegisterTrend | undefined;
}

function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

function startOfLocalDay(date: Date): Date {
  return localDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysInLocalMonth(year: number, monthIndex: number): number {
  return localDate(year, monthIndex + 1, 0).getDate();
}

/** `[local midnight of the day, next local midnight)`. */
export function getCashRegisterDayInterval(day: Date): CashRegisterInterval {
  return {
    start: startOfLocalDay(day),
    end: localDate(day.getFullYear(), day.getMonth(), day.getDate() + 1),
  };
}

/**
 * `[local midnight of firstDay, local midnight after lastDay)`: a range of
 * local civil days, both included — a week of the Agenda is Monday → Sunday.
 * Built from local calendar fields, so a DST change inside the range never
 * moves a bound.
 */
export function getCashRegisterDaysInterval(firstDay: Date, lastDay: Date): CashRegisterInterval {
  return {
    start: startOfLocalDay(firstDay),
    end: localDate(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1),
  };
}

/** `[local midnight of the 1st, local midnight of the next month's 1st)`. */
export function getCashRegisterMonthInterval(month: Date): CashRegisterInterval {
  return {
    start: localDate(month.getFullYear(), month.getMonth(), 1),
    end: localDate(month.getFullYear(), month.getMonth() + 1, 1),
  };
}

/** The windows of a month comparison, or the reason none exists (see the header). */
type MonthComparisonResolution =
  | { readonly comparison: CashRegisterComparison }
  | {
      readonly reason: Extract<CashRegisterComparisonUnavailableReason, 'FUTURE_MONTH' | 'NO_EQUIVALENT_SPAN'>;
      readonly month: Date;
      readonly referenceMonth: Date;
    };

function resolveMonthComparison(
  month: Date,
  now: Date,
  reference: CashRegisterComparisonReference,
): MonthComparisonResolution {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = localDate(year, monthIndex, 1);
  const nextMonthStart = localDate(year, monthIndex + 1, 1);

  const referenceYear = reference === 'PREVIOUS_YEAR' ? year - 1 : year;
  const referenceMonthIndex = reference === 'PREVIOUS_YEAR' ? monthIndex : monthIndex - 1;
  const previousStart = localDate(referenceYear, referenceMonthIndex, 1);

  if (monthStart.getTime() > now.getTime()) {
    return { reason: 'FUTURE_MONTH', month: monthStart, referenceMonth: previousStart };
  }

  if (now.getTime() < nextMonthStart.getTime()) {
    const elapsedDay = now.getDate();
    if (daysInLocalMonth(previousStart.getFullYear(), previousStart.getMonth()) < elapsedDay) {
      return { reason: 'NO_EQUIVALENT_SPAN', month: monthStart, referenceMonth: previousStart };
    }
    const previousEnd = new Date(
      previousStart.getFullYear(),
      previousStart.getMonth(),
      elapsedDay,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
    return {
      comparison: {
        reference,
        elapsed: true,
        current: { start: monthStart, end: nextMonthStart },
        previous: { start: previousStart, end: previousEnd },
      },
    };
  }

  return {
    comparison: {
      reference,
      elapsed: false,
      current: { start: monthStart, end: nextMonthStart },
      previous: {
        start: previousStart,
        end: localDate(previousStart.getFullYear(), previousStart.getMonth() + 1, 1),
      },
    },
  };
}

/**
 * The two windows that compare the month `month` falls in with its reference
 * month, as of `now`. Undefined for a future month and when the reference
 * month has no equivalent elapsed span (see the header).
 */
export function getCashRegisterMonthComparison(
  month: Date,
  now: Date,
  reference: CashRegisterComparisonReference,
): CashRegisterComparison | undefined {
  const resolution = resolveMonthComparison(month, now, reference);
  return 'comparison' in resolution ? resolution.comparison : undefined;
}

function earliest(current: Date | undefined, candidate: Date | undefined): Date | undefined {
  if (candidate === undefined || Number.isNaN(candidate.getTime())) return current;
  if (current === undefined || candidate.getTime() < current.getTime()) return candidate;
  return current;
}

/**
 * The local midnight of the earliest recorded activity — the first day
 * BeautIzzy demonstrably held this business's records. Undefined without any
 * record. Reads every Appointment (whatever its status), Sale and deposit
 * (ACTIVE or VOIDED): a voided deposit is still a trace of recording.
 */
export function getCashRegisterHistoryStart(sources: CashRegisterSources): Date | undefined {
  let start: Date | undefined;
  for (const appointment of sources.appointments) {
    start = earliest(start, appointment.startAt);
    start = earliest(start, appointment.payment?.paidAt);
  }
  for (const sale of sources.sales) {
    start = earliest(start, sale.completedAt);
    start = earliest(start, sale.payment?.paidAt);
  }
  for (const deposit of sources.deposits ?? []) {
    start = earliest(start, deposit.paidAt);
  }
  return start === undefined ? undefined : startOfLocalDay(start);
}

/** The history covers the window when it begins on or before the window's first day. */
export function isCashRegisterIntervalCovered(
  historyStart: Date | undefined,
  interval: CashRegisterInterval,
): boolean {
  return historyStart !== undefined && historyStart.getTime() <= interval.start.getTime();
}

/**
 * THE trend arithmetic. Undefined when both values are 0. The ratio is
 * undefined when `previous` is 0 (no division): the caller shows the
 * absolute change instead.
 */
export function compareCashRegisterValues(
  current: number,
  previous: number,
  comparison: CashRegisterComparison,
): CashRegisterTrend | undefined {
  if (current === 0 && previous === 0) return undefined;
  const delta = current - previous;
  return {
    direction: delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT',
    current,
    previous,
    delta,
    ratio: previous === 0 ? undefined : delta / previous,
    comparison,
  };
}

function isWithin(interval: CashRegisterInterval, date: Date): boolean {
  const time = date.getTime();
  return time >= interval.start.getTime() && time < interval.end.getTime();
}

/** Product units and direct product sales of ONE window (see the header). */
export function getCashRegisterProductSummary(
  sources: CashRegisterSources,
  interval: CashRegisterInterval,
): CashRegisterProductSummary {
  let standaloneUnitCount = 0;
  let appointmentUnitCount = 0;
  for (const sale of sources.sales) {
    if (!isWithin(interval, sale.completedAt)) continue;
    const units = sale.items.reduce((count, item) => count + item.quantity, 0);
    if (sale.appointmentId === undefined) standaloneUnitCount += units;
    else appointmentUnitCount += units;
  }

  let standaloneCollectedCents = 0;
  for (const entry of getCashRegisterEntries(sources)) {
    if (entry.kind !== 'SALE' || !isWithin(interval, entry.payment.paidAt)) continue;
    standaloneCollectedCents += entry.payment.cardAmountCents + entry.payment.cashAmountCents;
  }

  return {
    unitCount: standaloneUnitCount + appointmentUnitCount,
    standaloneUnitCount,
    appointmentUnitCount,
    standaloneCollectedCents,
  };
}

/** The product summary of ONE local civil day — what the Caisse Jour shows. */
export function getCashRegisterDayProductSummary(
  sources: CashRegisterSources,
  day: Date,
): CashRegisterProductSummary {
  return getCashRegisterProductSummary(sources, getCashRegisterDayInterval(day));
}

function cashTrendOf(sources: CashRegisterSources, comparison: CashRegisterComparison): CashRegisterTrend | undefined {
  return compareCashRegisterValues(
    getCashRegisterIntervalSummary(sources, comparison.current).totalCents,
    getCashRegisterIntervalSummary(sources, comparison.previous).totalCents,
    comparison,
  );
}

/**
 * THE availability of the collected-total comparison of `month` against its
 * reference, as of `now`: the trend, or the first reason (header, « Availability »)
 * that stops it. A covered reference that collected nothing is a real zero and
 * stays AVAILABLE (the trend then carries no ratio); only two zeros compare nothing.
 */
function compareCashRegisterMonth(
  sources: CashRegisterSources,
  historyStart: Date | undefined,
  month: Date,
  now: Date,
  reference: CashRegisterComparisonReference,
): CashRegisterComparisonOutcome {
  const resolution = resolveMonthComparison(month, now, reference);
  if ('reason' in resolution) {
    return { status: 'UNAVAILABLE', reason: resolution.reason, reference, month: resolution.month, referenceMonth: resolution.referenceMonth };
  }
  const { comparison } = resolution;
  const unavailable = (reason: CashRegisterComparisonUnavailableReason): CashRegisterComparisonOutcome => ({
    status: 'UNAVAILABLE',
    reason,
    reference,
    month: comparison.current.start,
    referenceMonth: comparison.previous.start,
  });
  if (!isCashRegisterIntervalCovered(historyStart, comparison.previous)) return unavailable('HISTORY_NOT_COVERED');
  const trend = cashTrendOf(sources, comparison);
  return trend === undefined ? unavailable('NOTHING_TO_COMPARE') : { status: 'AVAILABLE', trend };
}

/**
 * Everything the Caisse Mois adds under its figures for the month `month`
 * falls in, as of `now`: the collected-total comparison with the previous
 * month (its trend, or the reason it is not offered), the quieter trend
 * against the previous year, the month's product summary and the product-unit
 * trend. The year and unit trends are simply undefined when their reference
 * window is not covered, has no equivalent span, or compares nothing with
 * nothing.
 */
export function getCashRegisterMonthInsights(
  sources: CashRegisterSources,
  month: Date,
  now: Date,
): CashRegisterMonthInsights {
  const historyStart = getCashRegisterHistoryStart(sources);
  const cashComparison = compareCashRegisterMonth(sources, historyStart, month, now, 'PREVIOUS_MONTH');
  const cashYear = compareCashRegisterMonth(sources, historyStart, month, now, 'PREVIOUS_YEAR');

  // The product-unit trend reads the same previous-month windows whenever the
  // reference is covered — whatever the money did (it may itself be all zeros).
  const previousMonth = resolveMonthComparison(month, now, 'PREVIOUS_MONTH');
  const unitWindows =
    'comparison' in previousMonth && isCashRegisterIntervalCovered(historyStart, previousMonth.comparison.previous)
      ? previousMonth.comparison
      : undefined;

  const monthStart = localDate(month.getFullYear(), month.getMonth(), 1);
  const monthInterval: CashRegisterInterval = {
    start: monthStart,
    end: localDate(month.getFullYear(), month.getMonth() + 1, 1),
  };
  const products = getCashRegisterProductSummary(sources, monthInterval);

  return {
    cashComparison,
    cashTrend: cashComparison.status === 'AVAILABLE' ? cashComparison.trend : undefined,
    cashYearTrend: cashYear.status === 'AVAILABLE' ? cashYear.trend : undefined,
    products,
    productUnitTrend:
      unitWindows === undefined
        ? undefined
        : compareCashRegisterValues(
            getCashRegisterProductSummary(sources, unitWindows.current).unitCount,
            getCashRegisterProductSummary(sources, unitWindows.previous).unitCount,
            unitWindows,
          ),
  };
}

