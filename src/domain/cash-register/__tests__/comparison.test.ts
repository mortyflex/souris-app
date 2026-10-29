import { checkoutAppointment, type Appointment, type AppointmentDeposit } from '../../appointments';
import type { Sale } from '../../sales';
import {
  compareCashRegisterValues,
  countCashRegisterPayingClients,
  getCashRegisterDayEntries,
  getCashRegisterDayProductSummary,
  getCashRegisterDaySummary,
  getCashRegisterHistoryStart,
  getCashRegisterMonthComparison,
  getCashRegisterMonthInsights,
  getCashRegisterMonthSummary,
  getCashRegisterProductSummary,
  isCashRegisterIntervalCovered,
  type CashRegisterComparison,
  type CashRegisterSources,
} from '..';

function appointment(id: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 12, 9, 0),
    status: 'SCHEDULED',
    items: [],
    ...overrides,
  };
}

/** A checkout received at `paidAt`, for an Appointment that started an hour before. */
function paid(id: string, paidAt: Date, cents: number, overrides: Partial<Appointment> = {}): Appointment {
  return checkoutAppointment(
    appointment(id, { startAt: new Date(paidAt.getTime() - 60 * 60 * 1000), ...overrides }),
    { cardAmountCents: cents, cashAmountCents: 0 },
    paidAt,
  );
}

function standaloneSale(
  id: string,
  paidAt: Date,
  quantity: number,
  cents: number,
  overrides: Partial<Sale> = {},
): Sale {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    completedAt: paidAt,
    items: [{ id: `${id}-0`, productId: 'p', productName: 'Shampoo', unitPrice: cents / 100 / quantity, quantity }],
    payment: { paidAt, cardAmountCents: cents, cashAmountCents: 0 },
    ...overrides,
  };
}

function linkedSale(id: string, appointmentId: string, completedAt: Date, quantity: number): Sale {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    appointmentId,
    completedAt,
    items: [{ id: `${id}-0`, productId: 'mask', productName: 'Mask', unitPrice: 24, quantity }],
  };
}

function deposit(id: string, appointmentId: string, paidAt: Date, amountCents: number): AppointmentDeposit {
  return {
    id,
    businessId: 'business-a',
    appointmentId,
    amountCents,
    paymentMethod: 'CASH',
    paidAt,
    status: 'ACTIVE',
    createdAt: paidAt,
  };
}

const noSources: CashRegisterSources = { appointments: [], sales: [] };

describe('Cash Register comparison windows', () => {
  it('compares the current month to date with the same elapsed span of the previous month', () => {
    const now = new Date(2026, 9, 29, 14, 35, 20, 7); // 29 October, 14:35:20.007
    const comparison = getCashRegisterMonthComparison(new Date(2026, 9, 1), now, 'PREVIOUS_MONTH');

    expect(comparison).toEqual({
      reference: 'PREVIOUS_MONTH',
      elapsed: true,
      // The whole month: exactly what the card totals, nothing is ever dated after now.
      current: { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) },
      previous: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 29, 14, 35, 20, 7) },
    });
  });

  it('compares a completed month with the whole previous month, whatever their lengths', () => {
    const now = new Date(2026, 9, 29, 14, 35);

    expect(getCashRegisterMonthComparison(new Date(2026, 8, 15), now, 'PREVIOUS_MONTH')).toEqual({
      reference: 'PREVIOUS_MONTH',
      elapsed: false,
      current: { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) },
      previous: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
    });
    // March (31 days) against February (28 days): whole against whole.
    expect(getCashRegisterMonthComparison(new Date(2026, 2, 1), now, 'PREVIOUS_MONTH')).toEqual({
      reference: 'PREVIOUS_MONTH',
      elapsed: false,
      current: { start: new Date(2026, 2, 1), end: new Date(2026, 3, 1) },
      previous: { start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) },
    });
  });

  it('crosses the year: January against December, and a month against the same month a year earlier', () => {
    const now = new Date(2027, 0, 12, 9, 0);
    expect(getCashRegisterMonthComparison(new Date(2027, 0, 1), now, 'PREVIOUS_MONTH')).toEqual({
      reference: 'PREVIOUS_MONTH',
      elapsed: true,
      current: { start: new Date(2027, 0, 1), end: new Date(2027, 1, 1) },
      previous: { start: new Date(2026, 11, 1), end: new Date(2026, 11, 12, 9, 0) },
    });
    expect(getCashRegisterMonthComparison(new Date(2027, 0, 1), now, 'PREVIOUS_YEAR')).toEqual({
      reference: 'PREVIOUS_YEAR',
      elapsed: true,
      current: { start: new Date(2027, 0, 1), end: new Date(2027, 1, 1) },
      previous: { start: new Date(2026, 0, 1), end: new Date(2026, 0, 12, 9, 0) },
    });
    expect(getCashRegisterMonthComparison(new Date(2026, 11, 1), now, 'PREVIOUS_MONTH')).toEqual({
      reference: 'PREVIOUS_MONTH',
      elapsed: false,
      current: { start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) },
      previous: { start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) },
    });
  });

  it('offers no window when the reference month has no equivalent elapsed day', () => {
    // 31 October against September (30 days); 29–31 March against February.
    expect(getCashRegisterMonthComparison(new Date(2026, 9, 1), new Date(2026, 9, 31, 10, 0), 'PREVIOUS_MONTH')).toBeUndefined();
    expect(getCashRegisterMonthComparison(new Date(2026, 2, 1), new Date(2026, 2, 29, 10, 0), 'PREVIOUS_MONTH')).toBeUndefined();
    expect(getCashRegisterMonthComparison(new Date(2026, 2, 1), new Date(2026, 2, 28, 10, 0), 'PREVIOUS_MONTH')).toBeDefined();
    // 29 February 2028 against February 2027, which has 28 days.
    expect(getCashRegisterMonthComparison(new Date(2028, 1, 1), new Date(2028, 1, 29, 10, 0), 'PREVIOUS_YEAR')).toBeUndefined();
    // The same month of the previous year is still offered on the 31st.
    expect(getCashRegisterMonthComparison(new Date(2026, 9, 1), new Date(2026, 9, 31, 10, 0), 'PREVIOUS_YEAR')).toEqual({
      reference: 'PREVIOUS_YEAR',
      elapsed: true,
      current: { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) },
      previous: { start: new Date(2025, 9, 1), end: new Date(2025, 9, 31, 10, 0) },
    });
  });

  it('offers nothing for a future month', () => {
    const now = new Date(2026, 9, 29, 14, 35);
    expect(getCashRegisterMonthComparison(new Date(2026, 10, 1), now, 'PREVIOUS_MONTH')).toBeUndefined();
    expect(getCashRegisterMonthComparison(new Date(2027, 0, 1), now, 'PREVIOUS_YEAR')).toBeUndefined();
  });
});

describe('Cash Register history coverage', () => {
  it('starts on the local day of the earliest recorded activity, whatever its kind', () => {
    expect(getCashRegisterHistoryStart(noSources)).toBeUndefined();

    const sources: CashRegisterSources = {
      appointments: [
        appointment('future', { startAt: new Date(2026, 11, 3, 10, 0) }),
        appointment('cancelled', { startAt: new Date(2026, 8, 20, 10, 0), status: 'CANCELLED' }),
      ],
      sales: [standaloneSale('s', new Date(2026, 8, 25, 10, 0), 1, 2000)],
      deposits: [
        {
          ...deposit('d', 'future', new Date(2026, 8, 2, 18, 45), 3000),
          status: 'VOIDED',
          voidedAt: new Date(2026, 8, 3),
        },
      ],
    };
    // The voided deposit of 2 September is the earliest trace: its local day.
    expect(getCashRegisterHistoryStart(sources)).toEqual(new Date(2026, 8, 2));
  });

  it('covers a window only when the history begins on or before its first day', () => {
    const window = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };
    expect(isCashRegisterIntervalCovered(undefined, window)).toBe(false);
    expect(isCashRegisterIntervalCovered(new Date(2026, 8, 2), window)).toBe(false);
    expect(isCashRegisterIntervalCovered(new Date(2026, 8, 1), window)).toBe(true);
    expect(isCashRegisterIntervalCovered(new Date(2026, 7, 15), window)).toBe(true);
  });
});

describe('Cash Register trend arithmetic', () => {
  const comparison: CashRegisterComparison = {
    reference: 'PREVIOUS_MONTH',
    elapsed: false,
    current: { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) },
    previous: { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) },
  };

  it('reports the direction, the delta and the ratio from exact values', () => {
    expect(compareCashRegisterValues(112_400, 100_000, comparison)).toEqual({
      direction: 'UP',
      current: 112_400,
      previous: 100_000,
      delta: 12_400,
      ratio: 0.124,
      comparison,
    });
    expect(compareCashRegisterValues(75_000, 100_000, comparison)).toMatchObject({
      direction: 'DOWN',
      delta: -25_000,
      ratio: -0.25,
    });
    expect(compareCashRegisterValues(100_000, 100_000, comparison)).toMatchObject({
      direction: 'FLAT',
      delta: 0,
      ratio: 0,
    });
    // One cent apart is not flat.
    expect(compareCashRegisterValues(100_001, 100_000, comparison)!.direction).toBe('UP');
  });

  it('never divides by a zero reference and compares nothing with nothing', () => {
    const fromZero = compareCashRegisterValues(4_200, 0, comparison)!;
    expect(fromZero.direction).toBe('UP');
    expect(fromZero.ratio).toBeUndefined();
    expect(fromZero.delta).toBe(4_200);
    expect(Number.isFinite(fromZero.delta)).toBe(true);
    expect(compareCashRegisterValues(0, 4_200, comparison)).toMatchObject({ direction: 'DOWN', ratio: -1 });
    expect(compareCashRegisterValues(0, 0, comparison)).toBeUndefined();
  });
});

describe('Cash Register product summary', () => {
  const window = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };

  it('counts quantities, never the number of Sales, and tells direct sales from Reventes', () => {
    const sources: CashRegisterSources = {
      appointments: [paid('a', new Date(2026, 8, 10, 16, 0), 14_300)],
      sales: [
        // ONE standalone Sale of three units, paid 60 €.
        standaloneSale('s1', new Date(2026, 8, 5, 10, 0), 3, 6_000),
        // Two units sold during the Appointment: paid inside its checkout, never on their own.
        linkedSale('l1', 'a', new Date(2026, 8, 10, 15, 0), 2),
      ],
    };
    expect(getCashRegisterProductSummary(sources, window)).toEqual({
      unitCount: 5,
      standaloneUnitCount: 3,
      appointmentUnitCount: 2,
      standaloneCollectedCents: 6_000,
    });
    // The Caisse itself: two entries, 203 € — the linked Sale adds nothing.
    expect(getCashRegisterMonthSummary(sources, window.start)).toMatchObject({ totalCents: 20_300, checkoutCount: 2 });
  });

  it('counts an anonymous Sale and the units of an unpaid historical Sale, but only recorded money', () => {
    const sources: CashRegisterSources = {
      appointments: [],
      sales: [
        standaloneSale('walk-in', new Date(2026, 8, 5, 10, 0), 1, 1_500, { clientId: undefined }),
        // Historical standalone Sale without a recorded payment: sold, but never collected here.
        standaloneSale('legacy', new Date(2026, 8, 6, 10, 0), 4, 8_000, { payment: undefined }),
      ],
    };
    expect(getCashRegisterProductSummary(sources, window)).toEqual({
      unitCount: 5,
      standaloneUnitCount: 5,
      appointmentUnitCount: 0,
      standaloneCollectedCents: 1_500,
    });
    expect(countCashRegisterPayingClients(getCashRegisterDayEntries(sources, new Date(2026, 8, 5)))).toBe(0);
  });

  it('ignores deposits and Sales outside the window, and reads one day exactly', () => {
    const sources: CashRegisterSources = {
      appointments: [appointment('a', { startAt: new Date(2026, 9, 3, 10, 0) })],
      sales: [
        standaloneSale('in', new Date(2026, 8, 30, 23, 59), 2, 4_000),
        standaloneSale('out', new Date(2026, 9, 1, 0, 0), 1, 2_000),
      ],
      deposits: [deposit('d', 'a', new Date(2026, 8, 20, 10, 0), 3_000)],
    };
    expect(getCashRegisterProductSummary(sources, window)).toEqual({
      unitCount: 2,
      standaloneUnitCount: 2,
      appointmentUnitCount: 0,
      standaloneCollectedCents: 4_000,
    });
    expect(getCashRegisterDayProductSummary(sources, new Date(2026, 8, 30, 8, 0)).unitCount).toBe(2);
    expect(getCashRegisterDayProductSummary(sources, new Date(2026, 9, 1, 8, 0)).unitCount).toBe(1);
    expect(getCashRegisterDayProductSummary(sources, new Date(2026, 8, 20, 8, 0)).unitCount).toBe(0);
  });
});

describe('Cash Register month insights', () => {
  // 29 October 2026, mid-afternoon; the business has recorded since July.
  const now = new Date(2026, 9, 29, 14, 35);
  const sources: CashRegisterSources = {
    appointments: [
      // 1 July: the first trace of activity (an automatically completed, unpaid Appointment).
      appointment('july', { startAt: new Date(2026, 6, 1, 10, 0), status: 'COMPLETED' }),
      // August.
      paid('aug-1', new Date(2026, 7, 4, 11, 0), 5_000),
      // September: inside and outside the 1 → 29 14:35 span.
      paid('sep-1', new Date(2026, 8, 10, 11, 0), 9_500),
      paid('sep-late', new Date(2026, 8, 29, 14, 35), 10_000), // exactly at the span end: excluded
      paid('sep-30', new Date(2026, 8, 30, 11, 0), 3_000),
      // October to date, with products sold during a checkout.
      paid('oct-1', new Date(2026, 9, 12, 11, 0), 14_300),
    ],
    sales: [
      standaloneSale('sep-sale', new Date(2026, 8, 20, 10, 0), 1, 2_000),
      linkedSale('oct-revente', 'oct-1', new Date(2026, 9, 12, 10, 0), 2),
      standaloneSale('oct-sale', new Date(2026, 9, 20, 10, 0), 3, 6_000),
    ],
    deposits: [
      // A deposit received in October for a November Appointment: October money.
      deposit('dep', 'nov', new Date(2026, 9, 22, 18, 0), 3_000),
    ],
  };

  it('compares October to date with 1 → 29 September at the same time, cash and units alike', () => {
    const insights = getCashRegisterMonthInsights(sources, new Date(2026, 9, 1), now);

    // October: 143 + 60 + 30 (deposit) = 233 €; 1 → 29 Sept. 14:35: 95 + 20 = 115 €.
    expect(insights.cashTrend).toMatchObject({
      direction: 'UP',
      current: 23_300,
      previous: 11_500,
      delta: 11_800,
      comparison: { reference: 'PREVIOUS_MONTH', elapsed: true },
    });
    expect(insights.cashTrend!.ratio).toBeCloseTo(11_800 / 11_500, 10);
    // The October figure IS the month total the card shows.
    expect(insights.cashTrend!.current).toBe(getCashRegisterMonthSummary(sources, new Date(2026, 9, 1)).totalCents);
    // Five units in October (two sold during a checkout), one in the September span.
    expect(insights.products).toEqual({
      unitCount: 5,
      standaloneUnitCount: 3,
      appointmentUnitCount: 2,
      standaloneCollectedCents: 6_000,
    });
    expect(insights.productUnitTrend).toMatchObject({ direction: 'UP', current: 5, previous: 1, delta: 4, ratio: 4 });
    // No history in October 2025: no year-over-year figure.
    expect(insights.cashYearTrend).toBeUndefined();
  });

  it('compares a completed month with the whole previous month', () => {
    const insights = getCashRegisterMonthInsights(sources, new Date(2026, 8, 15), now);
    // Whole September 95 + 100 + 30 + 20 = 245 € against whole August 50 €.
    expect(insights.cashTrend).toMatchObject({
      direction: 'UP',
      current: 24_500,
      previous: 5_000,
      ratio: 3.9,
      comparison: { reference: 'PREVIOUS_MONTH', elapsed: false },
    });
    expect(insights.productUnitTrend).toMatchObject({ direction: 'UP', current: 1, previous: 0, ratio: undefined });
  });

  it('keeps a real zero reference without dividing, and hides a reference the history does not cover', () => {
    // August (50 €) against July (0 €, but recorded since 1 July): a rise from nothing.
    const august = getCashRegisterMonthInsights(sources, new Date(2026, 7, 1), now);
    expect(august.cashTrend).toMatchObject({ direction: 'UP', current: 5_000, previous: 0, delta: 5_000, ratio: undefined });
    expect(august.productUnitTrend).toBeUndefined(); // 0 units against 0 units: nothing to compare

    // July against June: nothing was recorded before 1 July, so June proves nothing.
    const july = getCashRegisterMonthInsights(sources, new Date(2026, 6, 1), now);
    expect(july.cashTrend).toBeUndefined();
    expect(july.productUnitTrend).toBeUndefined();
    expect(july.cashYearTrend).toBeUndefined();
    // The month's own figures are still read.
    expect(july.products.unitCount).toBe(0);
  });

  it('reports a fall and a flat month exactly', () => {
    const flatSources: CashRegisterSources = {
      appointments: [
        // Recorded since April: May, June and July are all covered.
        appointment('april', { startAt: new Date(2026, 3, 20, 10, 0), status: 'COMPLETED' }),
        paid('may', new Date(2026, 4, 2, 10, 0), 8_000),
        paid('jun', new Date(2026, 5, 2, 10, 0), 8_000),
        paid('jul', new Date(2026, 6, 2, 10, 0), 2_000),
      ],
      sales: [],
    };
    expect(getCashRegisterMonthInsights(flatSources, new Date(2026, 5, 1), now).cashTrend).toMatchObject({
      direction: 'FLAT',
      delta: 0,
      ratio: 0,
    });
    expect(getCashRegisterMonthInsights(flatSources, new Date(2026, 6, 1), now).cashTrend).toMatchObject({
      direction: 'DOWN',
      current: 2_000,
      previous: 8_000,
      ratio: -0.75,
    });
  });

  it('adds a year-over-year trend only when the same span a year earlier is covered', () => {
    const yearSources: CashRegisterSources = {
      appointments: [
        appointment('sep-2025', { startAt: new Date(2025, 8, 28, 10, 0), status: 'COMPLETED' }),
        paid('oct-2025', new Date(2025, 9, 10, 10, 0), 10_000),
        paid('oct-2025-late', new Date(2025, 9, 29, 15, 0), 50_000), // after 14:35 on the 29th: excluded
        paid('sep-2026', new Date(2026, 8, 10, 10, 0), 8_000),
        paid('oct-2026', new Date(2026, 9, 10, 10, 0), 12_000),
      ],
      sales: [],
    };
    const insights = getCashRegisterMonthInsights(yearSources, new Date(2026, 9, 1), now);
    expect(insights.cashTrend).toMatchObject({ direction: 'UP', current: 12_000, previous: 8_000, ratio: 0.5 });
    expect(insights.cashYearTrend).toMatchObject({
      direction: 'UP',
      current: 12_000,
      previous: 10_000,
      ratio: 0.2,
      comparison: { reference: 'PREVIOUS_YEAR', elapsed: true },
    });
    // Without the September 2025 record the history begins on 10 October 2025: the span
    // 1 → 29 Oct. 2025 is NOT covered from its first day, whatever it holds.
    const lateStart: CashRegisterSources = {
      ...yearSources,
      appointments: yearSources.appointments.filter((entry) => entry.id !== 'sep-2025'),
    };
    expect(getCashRegisterMonthInsights(lateStart, new Date(2026, 9, 1), now).cashYearTrend).toBeUndefined();
  });

  it('offers no trend on the 31st against a 30-day month, nor for a future month', () => {
    const insights = getCashRegisterMonthInsights(sources, new Date(2026, 9, 1), new Date(2026, 9, 31, 10, 0));
    expect(insights.cashTrend).toBeUndefined();
    expect(insights.productUnitTrend).toBeUndefined();
    expect(insights.products.unitCount).toBe(5);
    expect(getCashRegisterMonthInsights(sources, new Date(2026, 10, 1), now).cashTrend).toBeUndefined();
  });

  describe('availability of the month-over-month comparison', () => {
    it('is AVAILABLE with the trend itself, a covered zero reference included', () => {
      const october = getCashRegisterMonthInsights(sources, new Date(2026, 9, 1), now);
      expect(october.cashComparison).toEqual({ status: 'AVAILABLE', trend: october.cashTrend });

      // August (50 €) against July (0 €, recorded since 1 July): the change itself, no ratio.
      const august = getCashRegisterMonthInsights(sources, new Date(2026, 7, 1), now);
      expect(august.cashComparison).toMatchObject({
        status: 'AVAILABLE',
        trend: { direction: 'UP', current: 5_000, previous: 0, delta: 5_000, ratio: undefined },
      });
    });

    it('tells an uncovered reference month from a real zero, naming both months', () => {
      // July against June: nothing was recorded before 1 July.
      const july = getCashRegisterMonthInsights(sources, new Date(2026, 6, 1), now);
      expect(july.cashComparison).toEqual({
        status: 'UNAVAILABLE',
        reason: 'HISTORY_NOT_COVERED',
        reference: 'PREVIOUS_MONTH',
        month: new Date(2026, 6, 1),
        referenceMonth: new Date(2026, 5, 1),
      });
      expect(july.cashTrend).toBeUndefined();

      // A business that started on 10 October with 437 € in October: September is NOT a known zero.
      const lateStart: CashRegisterSources = {
        appointments: [paid('oct', new Date(2026, 9, 10, 10, 0), 43_700)],
        sales: [],
      };
      expect(getCashRegisterMonthInsights(lateStart, new Date(2026, 9, 1), now).cashComparison).toMatchObject({
        status: 'UNAVAILABLE',
        reason: 'HISTORY_NOT_COVERED',
        referenceMonth: new Date(2026, 8, 1),
      });
    });

    it('reports a missing equivalent day before anything else, and a future month', () => {
      expect(
        getCashRegisterMonthInsights(sources, new Date(2026, 9, 1), new Date(2026, 9, 31, 10, 0)).cashComparison,
      ).toEqual({
        status: 'UNAVAILABLE',
        reason: 'NO_EQUIVALENT_SPAN',
        reference: 'PREVIOUS_MONTH',
        month: new Date(2026, 9, 1),
        referenceMonth: new Date(2026, 8, 1),
      });
      // Even for a business whose history would not cover September: the window comes first.
      expect(
        getCashRegisterMonthInsights(noSources, new Date(2026, 9, 1), new Date(2026, 9, 31, 10, 0)).cashComparison,
      ).toMatchObject({ reason: 'NO_EQUIVALENT_SPAN' });
      // January 2027 against December 2026: the reference month belongs to another year.
      expect(getCashRegisterMonthInsights(sources, new Date(2027, 0, 1), now).cashComparison).toEqual({
        status: 'UNAVAILABLE',
        reason: 'FUTURE_MONTH',
        reference: 'PREVIOUS_MONTH',
        month: new Date(2027, 0, 1),
        referenceMonth: new Date(2026, 11, 1),
      });
    });

    it('compares nothing with nothing when two covered months both collected nothing', () => {
      const quiet: CashRegisterSources = {
        appointments: [
          appointment('march', { startAt: new Date(2026, 2, 3, 10, 0), status: 'CANCELLED' }),
          paid('jun', new Date(2026, 5, 2, 10, 0), 8_000),
        ],
        sales: [],
      };
      // May (0 €) against April (0 €), both recorded since March.
      expect(getCashRegisterMonthInsights(quiet, new Date(2026, 4, 1), now).cashComparison).toEqual({
        status: 'UNAVAILABLE',
        reason: 'NOTHING_TO_COMPARE',
        reference: 'PREVIOUS_MONTH',
        month: new Date(2026, 4, 1),
        referenceMonth: new Date(2026, 3, 1),
      });
      // June (80 €) against May (0 €): a real zero, still a comparison.
      expect(getCashRegisterMonthInsights(quiet, new Date(2026, 5, 1), now).cashComparison).toMatchObject({
        status: 'AVAILABLE',
        trend: { previous: 0, ratio: undefined },
      });
      // The unit trend follows the same covered windows, whatever the money did.
      expect(getCashRegisterMonthInsights(quiet, new Date(2026, 4, 1), now).productUnitTrend).toBeUndefined();
    });
  });

  it('leaves the existing totals and paying-client counts exactly as they were', () => {
    expect(getCashRegisterMonthSummary(sources, new Date(2026, 9, 1))).toEqual({
      totalCents: 23_300,
      cardCents: 20_300,
      cashCents: 3_000,
      checkoutCount: 3,
    });
    expect(getCashRegisterDaySummary(sources, new Date(2026, 9, 12))).toMatchObject({ totalCents: 14_300, checkoutCount: 1 });
    expect(countCashRegisterPayingClients(getCashRegisterDayEntries(sources, new Date(2026, 9, 12)))).toBe(1);
  });
});
