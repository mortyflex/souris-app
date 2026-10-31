import { checkoutAppointment, type Appointment } from '../../appointments';
import { getClientTotalSpentCents } from '../../clients/spending';
import { getBusinessInsights } from '../../insights/business-insights';
import { getInsightsPeriod } from '../../insights/period';
import type { Sale, SaleAdjustment } from '../../sales';
import {
  countCashRegisterPayingClients,
  getCashRegisterDailyTotals,
  getCashRegisterDayEntries,
  getCashRegisterDayInterval,
  getCashRegisterDaySummary,
  getCashRegisterMonthInterval,
  getCashRegisterMonthSummary,
  getCashRegisterRefundSummary,
  type CashRegisterSources,
} from '..';

const saleDay = new Date(2026, 9, 12, 10, 0);
const refundDay = new Date(2026, 9, 14, 16, 0);

const direct: Sale = {
  id: 'sale-direct',
  businessId: 'b',
  clientId: 'client-a',
  completedAt: saleDay,
  items: [{ id: 'line-care', productId: 'p-care', productName: 'Soin', unitPrice: 18, quantity: 2 }],
  payment: { paidAt: saleDay, cardAmountCents: 3600, cashAmountCents: 0 },
};

const appointment: Appointment = checkoutAppointment(
  {
    id: 'appointment-a',
    businessId: 'b',
    clientId: 'client-b',
    staffMemberId: 's',
    startAt: new Date(2026, 9, 12, 9, 0),
    status: 'SCHEDULED',
    items: [
      {
        id: 'i',
        serviceId: 'svc',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 30,
        phases: [{ id: 'ph', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
      },
    ],
  },
  { cardAmountCents: 0, cashAmountCents: 5500 },
  new Date(2026, 9, 12, 10, 0),
);

const revente: Sale = {
  id: 'sale-revente',
  businessId: 'b',
  clientId: 'client-b',
  appointmentId: 'appointment-a',
  completedAt: saleDay,
  items: [{ id: 'line-mask', productId: 'p-mask', productName: 'Masque', unitPrice: 25, quantity: 1 }],
};

function adjustment(overrides: Partial<SaleAdjustment>): SaleAdjustment {
  return {
    id: 'adj',
    businessId: 'b',
    saleId: 'sale-direct',
    kind: 'REFUND',
    reason: 'WRONG_PRODUCT',
    staffMemberId: 's',
    items: [],
    refundCardCents: 1800,
    refundCashCents: 0,
    initialStatus: 'SETTLED',
    status: 'SETTLED',
    refundedAt: refundDay,
    settledAt: refundDay,
    recordedAt: refundDay,
    ...overrides,
  };
}

const settledDirect = adjustment({ id: 'adj-direct' });
const settledRevente = adjustment({
  id: 'adj-revente',
  saleId: 'sale-revente',
  refundCardCents: 0,
  refundCashCents: 2500,
});
const pending = adjustment({
  id: 'adj-pending',
  initialStatus: 'PENDING',
  status: 'PENDING',
  refundedAt: undefined,
  settledAt: undefined,
  refundCardCents: 500,
});

function sources(saleAdjustments: readonly SaleAdjustment[]): CashRegisterSources {
  return { appointments: [appointment], sales: [direct, revente], saleAdjustments };
}

describe('Cash Register — Sale refunds', () => {
  it('keeps every receipt on its own day, unchanged by a later refund', () => {
    expect(getCashRegisterDaySummary(sources([settledDirect, settledRevente]), saleDay)).toEqual(
      getCashRegisterDaySummary(sources([]), saleDay),
    );
    expect(getCashRegisterDaySummary(sources([]), saleDay)).toEqual({
      totalCents: 9100,
      cardCents: 3600,
      cashCents: 5500,
      checkoutCount: 2,
    });
  });

  it('counts a SETTLED refund negatively on the day it actually happened, by its own method — never as a receipt', () => {
    const day = getCashRegisterDaySummary(sources([settledDirect, settledRevente, pending]), refundDay);
    expect(day).toEqual({ totalCents: -4300, cardCents: -1800, cashCents: -2500, checkoutCount: 0 });
    const month = getCashRegisterMonthSummary(sources([settledDirect, settledRevente, pending]), saleDay);
    expect(month).toEqual({ totalCents: 4800, cardCents: 1800, cashCents: 3000, checkoutCount: 2 });
    expect(getCashRegisterDailyTotals(sources([settledDirect])).get('2026-10-14')).toBe(-1800);
  });

  it('a PENDING or VOIDED refund moves nothing; money returned after a refund comes back on its own day', () => {
    const voided = adjustment({ id: 'adj-voided', status: 'VOIDED', voidedAt: refundDay, initialStatus: 'PENDING', refundedAt: undefined, settledAt: undefined });
    expect(getCashRegisterDaySummary(sources([pending, voided]), refundDay).totalCents).toBe(0);
    const reversalDay = new Date(2026, 9, 20, 9, 0);
    const reversal = adjustment({
      id: 'rev',
      kind: 'REVERSAL',
      reversesAdjustmentId: 'adj-direct',
      reason: 'REFUND_RETURNED',
      refundedAt: reversalDay,
      settledAt: reversalDay,
      recordedAt: reversalDay,
    });
    expect(getCashRegisterDaySummary(sources([settledDirect, reversal]), refundDay).totalCents).toBe(-1800);
    expect(getCashRegisterDaySummary(sources([settledDirect, reversal]), reversalDay).totalCents).toBe(1800);
    expect(getCashRegisterMonthSummary(sources([settledDirect, reversal]), saleDay).totalCents).toBe(9100);
  });

  it('lists the refund as its own entry of the Sale, and never counts it as a paying client', () => {
    const entries = getCashRegisterDayEntries(sources([settledDirect]), refundDay);
    expect(entries.map((entry) => entry.kind)).toEqual(['SALE_ADJUSTMENT']);
    expect(entries[0]?.kind === 'SALE_ADJUSTMENT' && entries[0].sale?.id).toBe('sale-direct');
    expect(countCashRegisterPayingClients(entries)).toBe(0);
  });

  it('summarizes the refunds of a period apart: gross, refunds by method, the Revente share', () => {
    expect(
      getCashRegisterRefundSummary(sources([settledDirect, settledRevente, pending]), getCashRegisterDayInterval(refundDay)),
    ).toEqual({
      refundCents: 4300,
      refundCardCents: 1800,
      refundCashCents: 2500,
      appointmentRefundCents: 2500,
      grossCents: 0,
      count: 2,
    });
    expect(
      getCashRegisterRefundSummary(sources([settledDirect, settledRevente]), getCashRegisterMonthInterval(saleDay)),
    ).toMatchObject({ refundCents: 4300, grossCents: 9100, count: 2 });
  });
});

describe('Client spending and Insights — settled refunds only, on their own date', () => {
  it('« Total dépensé » subtracts the money actually given back, never a pending one', () => {
    const spending = (saleAdjustments: readonly SaleAdjustment[]) => ({
      appointments: [appointment],
      sales: [direct, revente],
      saleAdjustments,
    });
    expect(getClientTotalSpentCents(spending([]), 'client-a')).toBe(3600);
    expect(getClientTotalSpentCents(spending([settledDirect, pending]), 'client-a')).toBe(1800);
    // Revente: counted through its completed Appointment (55 €), the refund once (−25 €).
    expect(getClientTotalSpentCents(spending([]), 'client-b')).toBe(5500);
    expect(getClientTotalSpentCents(spending([settledRevente]), 'client-b')).toBe(3000);
  });

  it('Tops & tendances: the cash of the period is net, the refund lowers the spending of ITS period', () => {
    const october = getInsightsPeriod('MONTH', new Date(2026, 9, 1));
    const insights = getBusinessInsights(
      { appointments: [appointment], sales: [direct, revente], saleAdjustments: [settledDirect] },
      october,
    );
    expect(insights.cash.totalCents).toBe(9100 - 1800);
    const clientA = insights.topSpendingClients.find((row) => row.clientId === 'client-a');
    expect(clientA?.spendingCents).toBe(1800);
  });
});

describe('Cash Register — a refund entered by mistake', () => {
  it('its correction counts on the SAME day: that day reads what really happened, both entries listed', () => {
    const correction = adjustment({
      id: 'correction',
      kind: 'REVERSAL',
      reversesAdjustmentId: 'adj-direct',
      reason: 'RECORDED_IN_ERROR',
      refundedAt: refundDay,
      settledAt: new Date(2026, 9, 25, 9, 0),
      recordedAt: new Date(2026, 9, 25, 9, 0),
    });
    const sourcesWith = sources([settledDirect, correction]);
    expect(getCashRegisterDaySummary(sourcesWith, refundDay)).toEqual({ totalCents: 0, cardCents: 0, cashCents: 0, checkoutCount: 0 });
    expect(getCashRegisterDayEntries(sourcesWith, refundDay).map((entry) => entry.kind === 'SALE_ADJUSTMENT' && entry.adjustment.id)).toEqual([
      'adj-direct',
      'correction',
    ]);
    // The day it was recorded does not move.
    expect(getCashRegisterDaySummary(sourcesWith, new Date(2026, 9, 25, 12, 0)).totalCents).toBe(0);
  });
});

