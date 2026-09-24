// Souris — Caisse month calendar decoration
//
// The Caisse day picker is the shared MonthCalendarSheet; this module turns
// the money received per local day (`getCashRegisterDailyTotals`, the SAME
// selection and arithmetic as the day summary) into its presentation: a
// soft halo whose strength is RELATIVE to the best day of the displayed
// month, and the actual amount spoken aloud.
//
// Relative intensity, integer cents only — no fixed euro thresholds, so the
// scale adapts to every business:
//   0                           → no halo
//   > 0     and ≤ 1/3 of max    → low
//   > 1/3   and ≤ 2/3 of max    → medium
//   > 2/3 of max                → high
// The best day (and every day equal to it) is always high; a month with one
// paying day shows it high. Adjacent-month days carry no halo — the scale is
// the displayed month's — but their amount is still spoken.

import { getCashRegisterDayKey } from '@/domain/cash-register';
import type { MonthCalendarDayDecoration, MonthCalendarDecorator } from '@/shared/ui/MonthCalendarSheet';

export type RevenueIntensity = 'low' | 'medium' | 'high';

/** The level of one day's amount against the best day of its month. */
export function getRevenueIntensity(cents: number, maxCents: number): RevenueIntensity | undefined {
  if (cents <= 0 || maxCents <= 0) return undefined;
  // Compared as integers: 3·cents against max and 2·max, no float ratio.
  if (cents * 3 > maxCents * 2) return 'high';
  if (cents * 3 > maxCents) return 'medium';
  return 'low';
}

/** The level of every paying day of `month`, keyed by `getCashRegisterDayKey`. */
export function getMonthRevenueIntensities(
  dailyTotals: ReadonlyMap<string, number>,
  month: Date,
): ReadonlyMap<string, RevenueIntensity> {
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: dayCount }, (_, index) =>
    getCashRegisterDayKey(new Date(month.getFullYear(), month.getMonth(), index + 1)),
  );
  const maxCents = Math.max(0, ...days.map((key) => dailyTotals.get(key) ?? 0));
  const intensities = new Map<string, RevenueIntensity>();
  for (const key of days) {
    const intensity = getRevenueIntensity(dailyTotals.get(key) ?? 0, maxCents);
    if (intensity) intensities.set(key, intensity);
  }
  return intensities;
}

/**
 * `245 euros encaissés`, `245,50 euros encaissés`, `1 euro encaissé`: the
 * exact amount in words for VoiceOver, cents only when there are some.
 */
export function formatRevenueAccessibilityDetail(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = cents % 100;
  const amount = rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
  return cents < 200 ? `${amount} euro encaissé` : `${amount} euros encaissés`;
}

/** The Caisse `decorateMonth` of the shared month calendar. */
export function decorateRevenueMonth(
  dailyTotals: ReadonlyMap<string, number>,
  month: Date,
): MonthCalendarDecorator {
  const intensities = getMonthRevenueIntensities(dailyTotals, month);
  return (day): MonthCalendarDayDecoration | undefined => {
    const key = getCashRegisterDayKey(day);
    const cents = dailyTotals.get(key) ?? 0;
    if (cents <= 0) return undefined;
    return { intensity: intensities.get(key), accessibilityDetail: formatRevenueAccessibilityDetail(cents) };
  };
}
