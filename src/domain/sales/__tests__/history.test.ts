import { getCashRegisterDayInterval, getCashRegisterMonthInterval } from '../../cash-register';
import {
  describeSaleHistoryEntry,
  findSaleHistoryEntry,
  getSaleChannel,
  getSalePaymentRecord,
  listSaleHistory,
  summarizeSaleHistory,
  type Sale,
} from '../index';

function sale(
  id: string,
  completedAt: Date,
  overrides: Partial<Pick<Sale, 'appointmentId' | 'clientId' | 'payment' | 'items'>> = {},
): Sale {
  return {
    id,
    businessId: 'business',
    clientId: 'client-a',
    completedAt,
    items: [{ id: `${id}-1`, productId: 'p-a', productName: 'Shampooing', unitPrice: 25, quantity: 1 }],
    ...overrides,
  };
}

const directPaid = sale('sale-direct', new Date(2026, 9, 12, 14, 35), {
  payment: { paidAt: new Date(2026, 9, 12, 14, 35), cardAmountCents: 1000, cashAmountCents: 1500 },
  items: [
    { id: 'sale-direct-1', productId: 'p-a', productName: 'Shampooing', unitPrice: 0.29, quantity: 3 },
    { id: 'sale-direct-2', productId: 'p-b', productName: 'Soin', unitPrice: 18, quantity: 2 },
  ],
});
const linked = sale('sale-linked', new Date(2026, 9, 12, 9, 0), { appointmentId: 'appointment-1' });
const historical = sale('sale-historical', new Date(2026, 9, 3, 11, 0));
const walkIn = sale('sale-walk-in', new Date(2026, 9, 12, 14, 35), {
  clientId: undefined,
  payment: { paidAt: new Date(2026, 9, 12, 14, 35), cardAmountCents: 2500, cashAmountCents: 0 },
});
const nextMonth = sale('sale-november', new Date(2026, 10, 1, 0, 0), {
  payment: { paidAt: new Date(2026, 10, 1), cardAmountCents: 2500, cashAmountCents: 0 },
});
const sales: readonly Sale[] = [historical, linked, directPaid, walkIn, nextMonth];

describe('Sale history', () => {
  it('reads the channel from the Appointment reference alone', () => {
    expect(getSaleChannel(directPaid)).toBe('DIRECT');
    expect(getSaleChannel(historical)).toBe('DIRECT');
    expect(getSaleChannel(linked)).toBe('APPOINTMENT');
  });

  it('reads how the money was recorded without inventing a method', () => {
    expect(getSalePaymentRecord(directPaid)).toBe('SALE_PAYMENT');
    expect(getSalePaymentRecord(linked)).toBe('APPOINTMENT_CHECKOUT');
    expect(getSalePaymentRecord(historical)).toBe('NONE');
    // A linked Sale never carries a payment; should one ever appear, the Appointment still owns the money.
    expect(getSalePaymentRecord({ appointmentId: 'a', payment: directPaid.payment })).toBe('APPOINTMENT_CHECKOUT');
  });

  it('derives exact cents from the snapshots — 3 × 0,29 € + 2 × 18 € is 3 687 cents, not a float', () => {
    const entry = describeSaleHistoryEntry(directPaid);
    expect(entry.totalCents).toBe(3687);
    expect(entry.unitCount).toBe(5);
    expect(entry.sale).toBe(directPaid);
  });

  it('lists the Sales of a local day, newest first, ties by id, without mutating the source', () => {
    const before = [...sales];
    const day = listSaleHistory(sales, getCashRegisterDayInterval(new Date(2026, 9, 12, 23, 0)));
    expect(day.map((entry) => entry.sale.id)).toEqual(['sale-walk-in', 'sale-direct', 'sale-linked']);
    expect(sales).toEqual(before);
  });

  it('lists a calendar month with exclusive end: midnight of the 1st of the next month is out', () => {
    const month = listSaleHistory(sales, getCashRegisterMonthInterval(new Date(2026, 9, 20)));
    expect(month.map((entry) => entry.sale.id)).toEqual([
      'sale-walk-in',
      'sale-direct',
      'sale-linked',
      'sale-historical',
    ]);
    const november = listSaleHistory(sales, getCashRegisterMonthInterval(new Date(2026, 10, 15)));
    expect(november.map((entry) => entry.sale.id)).toEqual(['sale-november']);
  });

  it('summarizes the listed period: sales, units, and where the units were sold', () => {
    const month = listSaleHistory(sales, getCashRegisterMonthInterval(new Date(2026, 9, 1)));
    expect(summarizeSaleHistory(month)).toEqual({
      saleCount: 4,
      unitCount: 8,
      directUnitCount: 7,
      appointmentUnitCount: 1,
    });
    expect(summarizeSaleHistory([])).toEqual({ saleCount: 0, unitCount: 0, directUnitCount: 0, appointmentUnitCount: 0 });
  });

  it('finds one Sale by id and nothing for an unknown or missing id', () => {
    expect(findSaleHistoryEntry(sales, 'sale-linked')?.channel).toBe('APPOINTMENT');
    expect(findSaleHistoryEntry(sales, 'sale-missing')).toBeUndefined();
    expect(findSaleHistoryEntry(sales, undefined)).toBeUndefined();
  });
});
