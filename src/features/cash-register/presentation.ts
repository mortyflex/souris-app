// BeautIzzy — Cash Register presentation helpers
//
// Local civil calendar navigation and French labels for the Caisse screen.
// Money formatting comes from the shared money helpers; totals come from
// the Appointment domain (cash-register derivation).

import type {
  CashRegisterComparison,
  CashRegisterComparisonOutcome,
  CashRegisterTrend,
} from '@/domain/cash-register';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';

export type CashRegisterPeriod = 'day' | 'month';

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftLocalDay(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function shiftLocalMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `Septembre 2026` */
export function formatCashRegisterMonth(date: Date): string {
  return capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date));
}

/**
 * Caption under the big total. BeautIzzy records what was received; it never
 * claims accounting-grade turnover.
 *   Day   → « encaissé aujourd'hui » / « encaissé ce jour »
 *   Month → « encaissé ce mois-ci » / « encaissé ce mois »
 */
export function formatCashRegisterCaption(period: CashRegisterPeriod, isCurrent: boolean): string {
  if (period === 'day') return isCurrent ? 'encaissé aujourd’hui' : 'encaissé ce jour';
  return isCurrent ? 'encaissé ce mois-ci' : 'encaissé ce mois';
}

/** `Aucun encaissement` / `1 encaissement` / `3 encaissements` */
export function formatCheckoutCount(count: number): string {
  if (count === 0) return 'Aucun encaissement';
  return `${count} encaissement${count > 1 ? 's' : ''}`;
}

/**
 * `Aucun client` / `1 client` / `7 clients` — the distinct identified clients
 * behind the period's payments (`countCashRegisterPayingClients`).
 */
export function formatPayingClientCount(count: number): string {
  if (count === 0) return 'Aucun client';
  return `${count} client${count > 1 ? 's' : ''}`;
}

/**
 * Empty « Encaissements » heading, worded for the selected period.
 *   Day   → « Aucun encaissement aujourd’hui » / « Aucun encaissement ce jour »
 *   Month → « Aucun encaissement ce mois-ci » / « Aucun encaissement ce mois »
 */
export function formatCashRegisterEmptyTitle(period: CashRegisterPeriod, isCurrent: boolean): string {
  if (period === 'day') return isCurrent ? 'Aucun encaissement aujourd’hui' : 'Aucun encaissement ce jour';
  return isCurrent ? 'Aucun encaissement ce mois-ci' : 'Aucun encaissement ce mois';
}

/**
 * How ONE payment was received, from its own recorded amounts:
 * `Carte`, `Espèces`, or `Carte + Espèces` for a mixed payment.
 * A payment with no amount on either side names no method.
 */
export function formatCashRegisterEntryMethods(payment: {
  readonly cardAmountCents: number;
  readonly cashAmountCents: number;
}): string {
  const methods: string[] = [];
  if (payment.cardAmountCents > 0) methods.push(paymentMethodLabels.CARD);
  if (payment.cashAmountCents > 0) methods.push(paymentMethodLabels.CASH);
  return methods.join(' + ');
}

/** `22 sept.` — the day of an entry listed in Month mode. */
export function formatCashRegisterEntryDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}

// ---------------------------------------------------------------------------
// Comparisons (docs/product/PRODUCT.md — Caisse, « Comparaisons »)
// ---------------------------------------------------------------------------

/** What a trend counts: integer cents, or product units. */
export type CashRegisterTrendUnit = 'cents' | 'units';

const percentFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  style: 'percent',
});

const MINUS = '−';

function signOf(trend: CashRegisterTrend): string {
  return trend.direction === 'DOWN' ? MINUS : '+';
}

/** `12,4 %` from a ratio, always positive — the sign is written by the caller. */
function formatRatio(ratio: number): string {
  return percentFormatter.format(Math.abs(ratio));
}

/** `1 240,00 €` or `3 unités`, always positive. */
function formatAbsoluteDelta(trend: CashRegisterTrend, unit: CashRegisterTrendUnit): string {
  const amount = Math.abs(trend.delta);
  return unit === 'cents' ? formatEuroCents(amount) : formatProductUnitCount(amount);
}

/**
 * The figure of a trend badge.
 *   cents, reference > 0   → `+12,4 %` / `−8,0 %`
 *   cents, reference = 0   → `+1 240,00 €` (nothing to divide by: the change itself)
 *   units                  → `+3` / `−2` (small counts: a percentage would mislead)
 *   unchanged              → `Stable`
 */
export function formatCashRegisterTrendValue(trend: CashRegisterTrend, unit: CashRegisterTrendUnit): string {
  if (trend.direction === 'FLAT') return 'Stable';
  if (unit === 'units') return `${signOf(trend)}${Math.abs(trend.delta)}`;
  if (trend.ratio === undefined) return `${signOf(trend)}${formatEuroCents(Math.abs(trend.delta))}`;
  return `${signOf(trend)}${formatRatio(trend.ratio)}`;
}

function formatReferenceMonth(comparison: CashRegisterComparison, month: 'short' | 'long'): string {
  const { start } = comparison.previous;
  const withYear = start.getFullYear() !== comparison.current.start.getFullYear();
  return new Intl.DateTimeFormat('fr-FR', { month, ...(withYear && { year: 'numeric' }) }).format(start);
}

function formatElapsedDay(day: number): string {
  return day === 1 ? '1er' : String(day);
}

/**
 * The compared window, short, for the caption next to a badge:
 *   `vs 1er–29 sept.` (the same elapsed span of the previous month)
 *   `vs sept.`         (the whole previous month)
 *   `vs 1er–29 oct. 2025` / `vs déc. 2026` (another year: the year is written)
 */
export function formatCashRegisterComparisonReference(comparison: CashRegisterComparison): string {
  const month = formatReferenceMonth(comparison, 'short');
  if (!comparison.elapsed) return `vs ${month}`;
  const lastDay = comparison.previous.end.getDate();
  return lastDay === 1 ? `vs ${formatElapsedDay(1)} ${month}` : `vs 1er–${lastDay} ${month}`;
}

/**
 * The spoken trend, direction in words (never a sign or a colour):
 * « En hausse de 12,4 % par rapport à la période du 1er au 29 septembre »,
 * « En baisse de 2 unités par rapport à septembre »,
 * « Stable par rapport à octobre 2025 ».
 */
export function describeCashRegisterTrend(trend: CashRegisterTrend, unit: CashRegisterTrendUnit): string {
  const month = formatReferenceMonth(trend.comparison, 'long');
  const lastDay = trend.comparison.previous.end.getDate();
  const reference = !trend.comparison.elapsed
    ? `par rapport à ${month}`
    : lastDay === 1
      ? `par rapport au 1er ${month}`
      : `par rapport à la période du 1er au ${lastDay} ${month}`;
  if (trend.direction === 'FLAT') return `Stable ${reference}`;
  const direction = trend.direction === 'UP' ? 'En hausse' : 'En baisse';
  const amount =
    unit === 'cents' && trend.ratio !== undefined ? formatRatio(trend.ratio) : formatAbsoluteDelta(trend, unit);
  return `${direction} de ${amount} ${reference}`;
}

/** `septembre` / `décembre 2025` — the reference month, with its year only when it differs. */
function formatReferenceMonthOf(month: Date, referenceMonth: Date): string {
  const withYear = referenceMonth.getFullYear() !== month.getFullYear();
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', ...(withYear && { year: 'numeric' }) }).format(
    referenceMonth,
  );
}

/**
 * Why the month shows no comparison, in one quiet sentence — or nothing, when
 * saying so would not help:
 *   HISTORY_NOT_COVERED  → « Historique insuffisant pour comparer avec septembre »
 *                          (the recorded history begins after the 1st of that month: an
 *                          empty earlier month is not a known zero)
 *   NO_EQUIVALENT_SPAN   → « Pas de 31 septembre : comparaison indisponible aujourd’hui »
 *                          (the reference month has no such day; only the current month)
 *   FUTURE_MONTH, NOTHING_TO_COMPARE, an available comparison → undefined
 */
export function describeCashRegisterComparisonUnavailability(
  outcome: CashRegisterComparisonOutcome,
  now: Date,
): string | undefined {
  if (outcome.status === 'AVAILABLE') return undefined;
  const month = formatReferenceMonthOf(outcome.month, outcome.referenceMonth);
  switch (outcome.reason) {
    case 'HISTORY_NOT_COVERED':
      return `Historique insuffisant pour comparer avec ${month}`;
    case 'NO_EQUIVALENT_SPAN':
      return `Pas de ${now.getDate()} ${month} : comparaison indisponible aujourd’hui`;
    case 'FUTURE_MONTH':
    case 'NOTHING_TO_COMPARE':
      return undefined;
  }
}

/** `Aucune unité` / `1 unité` / `12 unités` */
export function formatProductUnitCount(count: number): string {
  if (count === 0) return 'Aucune unité';
  return `${count} unité${count > 1 ? 's' : ''}`;
}

/**
 * « 7 en vente directe · 5 pendant des rendez-vous » — where the units of the
 * period were sold. Undefined when nothing was sold during an Appointment:
 * every unit is then a direct sale and the split says nothing.
 */
export function formatProductUnitSplit(summary: {
  readonly standaloneUnitCount: number;
  readonly appointmentUnitCount: number;
}): string | undefined {
  if (summary.appointmentUnitCount === 0) return undefined;
  return `${summary.standaloneUnitCount} en vente directe · ${summary.appointmentUnitCount} pendant des rendez-vous`;
}
