import {
  compareCashRegisterValues,
  type CashRegisterComparison,
  type CashRegisterTrend,
} from '@/domain/cash-register';
import { formatEuroCents } from '@/shared/lib/money';

import {
  canToggleCashRegisterTrendDisplay,
  describeCashRegisterComparisonUnavailability,
  describeCashRegisterTrend,
  describeCashRegisterTrendToggle,
  formatCashRegisterComparisonReference,
  formatCashRegisterEmptyTitle,
  formatCashRegisterEntryDay,
  formatCashRegisterEntryMethods,
  formatCashRegisterMonth,
  formatCashRegisterTrendValue,
  formatCheckoutCount,
  formatPayingClientCount,
  formatProductUnitCount,
  formatProductUnitSplit,
  getDefaultCashRegisterTrendDisplay,
  isSameLocalDay,
  isSameLocalMonth,
  shiftLocalDay,
  shiftLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
  toggleCashRegisterTrendDisplay,
} from '../presentation';

describe('Cash Register presentation', () => {
  // The selected DAY is formatted by the shared DateNavigator (see its test).
  it('formats the selected calendar month in French', () => {
    expect(formatCashRegisterMonth(new Date(2026, 8, 12))).toBe('Septembre 2026');
  });

  it('navigates by local civil day and calendar month across boundaries', () => {
    expect(shiftLocalDay(new Date(2026, 8, 1), -1)).toEqual(new Date(2026, 7, 31));
    expect(shiftLocalDay(new Date(2026, 11, 31), 1)).toEqual(new Date(2027, 0, 1));
    expect(shiftLocalMonth(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1));
    expect(shiftLocalMonth(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
    expect(startOfLocalDay(new Date(2026, 8, 12, 23, 59))).toEqual(new Date(2026, 8, 12));
    expect(startOfLocalMonth(new Date(2026, 8, 12, 23, 59))).toEqual(new Date(2026, 8, 1));
  });

  it('compares local days and months', () => {
    expect(isSameLocalDay(new Date(2026, 8, 12, 0, 1), new Date(2026, 8, 12, 23, 59))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 8, 12, 23, 59), new Date(2026, 8, 13, 0, 0))).toBe(false);
    expect(isSameLocalMonth(new Date(2026, 8, 1), new Date(2026, 8, 30))).toBe(true);
    expect(isSameLocalMonth(new Date(2026, 8, 30), new Date(2026, 9, 1))).toBe(false);
  });

  it('counts checkouts in plain words', () => {
    expect(formatCheckoutCount(0)).toBe('Aucun encaissement');
    expect(formatCheckoutCount(1)).toBe('1 encaissement');
    expect(formatCheckoutCount(3)).toBe('3 encaissements');
  });

  it('counts the distinct paying clients in neutral wording', () => {
    expect(formatPayingClientCount(0)).toBe('Aucun client');
    expect(formatPayingClientCount(1)).toBe('1 client');
    expect(formatPayingClientCount(7)).toBe('7 clients');
  });

  it('words the empty Encaissements heading for the selected period', () => {
    expect(formatCashRegisterEmptyTitle('day', true)).toBe('Aucun encaissement aujourd’hui');
    expect(formatCashRegisterEmptyTitle('day', false)).toBe('Aucun encaissement ce jour');
    expect(formatCashRegisterEmptyTitle('month', true)).toBe('Aucun encaissement ce mois-ci');
    expect(formatCashRegisterEmptyTitle('month', false)).toBe('Aucun encaissement ce mois');
  });

  it('names how one payment was received from its own amounts', () => {
    expect(formatCashRegisterEntryMethods({ cardAmountCents: 9500, cashAmountCents: 0 })).toBe('Carte');
    expect(formatCashRegisterEntryMethods({ cardAmountCents: 0, cashAmountCents: 4000 })).toBe('Espèces');
    expect(formatCashRegisterEntryMethods({ cardAmountCents: 1000, cashAmountCents: 4000 })).toBe('Carte + Espèces');
    expect(formatCashRegisterEntryMethods({ cardAmountCents: 0, cashAmountCents: 0 })).toBe('');
  });

  it('dates a Month mode entry compactly', () => {
    expect(formatCashRegisterEntryDay(new Date(2026, 8, 22, 9, 0))).toBe('22 sept.');
  });
});

describe('Cash Register comparison presentation', () => {
  const elapsed: CashRegisterComparison = {
    reference: 'PREVIOUS_MONTH',
    elapsed: true,
    current: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 29, 14, 35) },
    previous: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 29, 14, 35) },
  };
  const whole: CashRegisterComparison = {
    reference: 'PREVIOUS_MONTH',
    elapsed: false,
    current: { start: new Date(2027, 0, 1), end: new Date(2027, 1, 1) },
    previous: { start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) },
  };
  const year: CashRegisterComparison = {
    reference: 'PREVIOUS_YEAR',
    elapsed: true,
    current: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 1, 8, 0) },
    previous: { start: new Date(2025, 9, 1), end: new Date(2025, 9, 1, 8, 0) },
  };
  const trend = (current: number, previous: number, comparison = elapsed): CashRegisterTrend =>
    compareCashRegisterValues(current, previous, comparison)!;

  it('writes a percentage with its sign for money against a non-zero reference, « Stable » when unchanged', () => {
    expect(formatCashRegisterTrendValue(trend(112_400, 100_000), 'cents')).toMatch(/^\+12,4\s%$/);
    expect(formatCashRegisterTrendValue(trend(92_000, 100_000), 'cents')).toMatch(/^−8,0\s%$/);
    expect(formatCashRegisterTrendValue(trend(100_000, 100_000), 'cents')).toBe('Stable');
    // Rounded to one decimal, never Infinity or NaN.
    expect(formatCashRegisterTrendValue(trend(100_001, 100_000), 'cents')).toMatch(/^\+0,0\s%$/);
    expect(formatCashRegisterTrendValue(trend(1_000_000, 100), 'cents')).toMatch(/^\+999\s?900,0\s%$/);
  });

  it('writes the change itself against a zero reference, and whole units for products', () => {
    expect(formatCashRegisterTrendValue(trend(124_000, 0), 'cents')).toBe(`+${formatEuroCents(124_000)}`);
    expect(formatCashRegisterTrendValue(trend(5, 2), 'units')).toBe('+3');
    expect(formatCashRegisterTrendValue(trend(2, 5), 'units')).toBe('−3');
    expect(formatCashRegisterTrendValue(trend(7, 0), 'units')).toBe('+7');
    expect(formatCashRegisterTrendValue(trend(4, 4), 'units')).toBe('Stable');
  });

  it('writes either display on demand, and the change itself whenever nothing can be divided', () => {
    expect(formatCashRegisterTrendValue(trend(112_400, 100_000), 'cents', 'absolute')).toBe(`+${formatEuroCents(12_400)}`);
    expect(formatCashRegisterTrendValue(trend(92_000, 100_000), 'cents', 'absolute')).toBe(`−${formatEuroCents(8_000)}`);
    expect(formatCashRegisterTrendValue(trend(12, 9), 'units', 'percent')).toMatch(/^\+33,3\s%$/);
    expect(formatCashRegisterTrendValue(trend(124_000, 0), 'cents', 'percent')).toBe(`+${formatEuroCents(124_000)}`);
    expect(formatCashRegisterTrendValue(trend(7, 0), 'units', 'percent')).toBe('+7');
    expect(formatCashRegisterTrendValue(trend(4, 4), 'units', 'percent')).toBe('Stable');

    expect(getDefaultCashRegisterTrendDisplay('cents')).toBe('percent');
    expect(getDefaultCashRegisterTrendDisplay('units')).toBe('absolute');
    expect(toggleCashRegisterTrendDisplay('percent')).toBe('absolute');
    expect(toggleCashRegisterTrendDisplay('absolute')).toBe('percent');
    expect(canToggleCashRegisterTrendDisplay(trend(112_400, 100_000))).toBe(true);
    expect(canToggleCashRegisterTrendDisplay(trend(124_000, 0))).toBe(false);
    expect(canToggleCashRegisterTrendDisplay(trend(100_000, 100_000))).toBe(false);
    expect(describeCashRegisterTrendToggle('percent', 'cents')).toBe('Touchez pour afficher la variation en euros');
    expect(describeCashRegisterTrendToggle('percent', 'units')).toBe('Touchez pour afficher la variation en unités');
    expect(describeCashRegisterTrendToggle('absolute', 'cents')).toBe('Touchez pour afficher la variation en pourcentage');
  });

  it('names the compared window, short, with the year only when it differs', () => {
    expect(formatCashRegisterComparisonReference(elapsed)).toBe('vs 1er–29 sept.');
    expect(formatCashRegisterComparisonReference(whole)).toBe('vs déc. 2026');
    expect(formatCashRegisterComparisonReference(year)).toBe('vs 1er oct. 2025');
    expect(
      formatCashRegisterComparisonReference({
        ...whole,
        current: { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) },
        previous: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
      }),
    ).toBe('vs août');
  });

  it('speaks the direction in words, never a sign or a colour', () => {
    expect(describeCashRegisterTrend(trend(112_400, 100_000), 'cents')).toMatch(
      /^En hausse de 12,4\s% par rapport à la période du 1er au 29 septembre$/,
    );
    expect(describeCashRegisterTrend(trend(2, 5), 'units')).toBe(
      'En baisse de 3 unités par rapport à la période du 1er au 29 septembre',
    );
    expect(describeCashRegisterTrend(trend(5_000, 0, whole), 'cents')).toBe(
      `En hausse de ${formatEuroCents(5_000)} par rapport à décembre 2026`,
    );
    expect(describeCashRegisterTrend(trend(3, 3, year), 'units')).toBe('Stable par rapport au 1er octobre 2025');
    // Spoken in the display shown on screen.
    expect(describeCashRegisterTrend(trend(112_400, 100_000), 'cents', 'absolute')).toBe(
      `En hausse de ${formatEuroCents(12_400)} par rapport à la période du 1er au 29 septembre`,
    );
    expect(describeCashRegisterTrend(trend(2, 5), 'units', 'percent')).toMatch(
      /^En baisse de 60,0\s% par rapport à la période du 1er au 29 septembre$/,
    );
  });

  it('explains an unavailable comparison only when the reason helps, naming the localized month', () => {
    const now = new Date(2026, 9, 31, 10, 0);
    const unavailable = (
      reason: 'FUTURE_MONTH' | 'NO_EQUIVALENT_SPAN' | 'HISTORY_NOT_COVERED' | 'NOTHING_TO_COMPARE',
      month = new Date(2026, 9, 1),
      referenceMonth = new Date(2026, 8, 1),
    ) => ({ status: 'UNAVAILABLE' as const, reason, reference: 'PREVIOUS_MONTH' as const, month, referenceMonth });

    expect(describeCashRegisterComparisonUnavailability(unavailable('HISTORY_NOT_COVERED'), now)).toBe(
      'Historique insuffisant pour comparer avec septembre',
    );
    // The year is written only when the reference month belongs to another one.
    expect(
      describeCashRegisterComparisonUnavailability(
        unavailable('HISTORY_NOT_COVERED', new Date(2026, 0, 1), new Date(2025, 11, 1)),
        now,
      ),
    ).toBe('Historique insuffisant pour comparer avec décembre 2025');
    // A missing day is never blamed on the history.
    expect(describeCashRegisterComparisonUnavailability(unavailable('NO_EQUIVALENT_SPAN'), now)).toBe(
      'Pas de 31 septembre : comparaison indisponible aujourd’hui',
    );
    expect(
      describeCashRegisterComparisonUnavailability(
        unavailable('NO_EQUIVALENT_SPAN', new Date(2027, 2, 1), new Date(2027, 1, 1)),
        new Date(2027, 2, 29, 9, 0),
      ),
    ).toBe('Pas de 29 février : comparaison indisponible aujourd’hui');
    // Nothing to say: a future month, two empty months, or an available comparison.
    expect(describeCashRegisterComparisonUnavailability(unavailable('FUTURE_MONTH'), now)).toBeUndefined();
    expect(describeCashRegisterComparisonUnavailability(unavailable('NOTHING_TO_COMPARE'), now)).toBeUndefined();
    expect(
      describeCashRegisterComparisonUnavailability({ status: 'AVAILABLE', trend: trend(2, 1) }, now),
    ).toBeUndefined();
  });

  it('counts units and tells where they were sold', () => {
    expect(formatProductUnitCount(0)).toBe('Aucune unité');
    expect(formatProductUnitCount(1)).toBe('1 unité');
    expect(formatProductUnitCount(12)).toBe('12 unités');
    expect(formatProductUnitSplit({ standaloneUnitCount: 7, appointmentUnitCount: 5 })).toBe(
      '7 en vente directe · 5 pendant des rendez-vous',
    );
    expect(formatProductUnitSplit({ standaloneUnitCount: 0, appointmentUnitCount: 2 })).toBe(
      '0 en vente directe · 2 pendant des rendez-vous',
    );
    expect(formatProductUnitSplit({ standaloneUnitCount: 7, appointmentUnitCount: 0 })).toBeUndefined();
  });
});
