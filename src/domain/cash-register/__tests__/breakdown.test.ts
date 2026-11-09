// « Encaissements » of « Résumé du jour » / « Résumé de la semaine »: what the
// Caisse total of a window is made of. The total must ALWAYS be the Caisse
// total of the same window (`getCashRegisterIntervalSummary`): one selection,
// never a parallel calculation.

import { checkoutAppointment, type Appointment, type AppointmentDeposit } from '../../appointments';
import type { Sale, SaleAdjustment, SaleItem } from '../../sales';
import {
  getCashRegisterDayInterval,
  getCashRegisterDaySummary,
  getCashRegisterDaysInterval,
  getCashRegisterIntervalSummary,
  getCashRegisterPeriodBreakdown,
  type CashRegisterInterval,
  type CashRegisterSources,
} from '..';

// Wednesday 4 November 2026, local civil calendar; its Agenda week is Mon 2 → Sun 8.
const at = (date: number, hour: number, minute = 0) => new Date(2026, 10, date, hour, minute);
const day = at(4, 12);
const today = getCashRegisterDayInterval(day);
const week = getCashRegisterDaysInterval(at(2, 0), at(8, 0));

function appointment(id: string, startAt: Date, price: number): Appointment {
  return {
    id,
    businessId: 'b',
    clientId: `client-${id}`,
    staffMemberId: 's',
    startAt,
    status: 'SCHEDULED',
    items: [
      {
        id: `${id}-i`,
        serviceId: 'svc',
        order: 0,
        serviceName: 'Pose gel',
        serviceType: 'SERVICE',
        price,
        phases: [{ id: `${id}-ph`, name: 'Pose', durationMinutes: 60, requiresStaff: true }],
      },
    ],
  };
}

/** An Appointment checked out at `paidAt` for `cents` (card). */
function paid(id: string, startAt: Date, cents: number, paidAt: Date): Appointment {
  return checkoutAppointment(appointment(id, startAt, cents / 100), { cardAmountCents: cents, cashAmountCents: 0 }, paidAt);
}

function item(productId: string, productName: string, unitPrice: number, quantity: number): SaleItem {
  return { id: `${productId}-${productName}-${quantity}`, productId, productName, unitPrice, quantity };
}

/** A standalone Sale paid at `paidAt` (payment = Σ lines, as a new Sale records it). */
function directSale(id: string, paidAt: Date, items: readonly SaleItem[]): Sale {
  const cents = items.reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0);
  return {
    id,
    businessId: 'b',
    clientId: 'client-s',
    completedAt: paidAt,
    items,
    payment: { paidAt, cardAmountCents: cents, cashAmountCents: 0 },
  };
}

function deposit(id: string, paidAt: Date, cents: number, status: AppointmentDeposit['status'] = 'ACTIVE'): AppointmentDeposit {
  return {
    id,
    businessId: 'b',
    appointmentId: 'later',
    amountCents: cents,
    paymentMethod: 'CASH',
    paidAt,
    status,
    createdAt: paidAt,
    ...(status === 'VOIDED' ? { voidedAt: paidAt } : {}),
  } as AppointmentDeposit;
}

function refund(id: string, saleId: string, cents: number, refundedAt: Date, overrides: Partial<SaleAdjustment> = {}): SaleAdjustment {
  return {
    id,
    businessId: 'b',
    saleId,
    kind: 'REFUND',
    reason: 'CUSTOMER_REFUND',
    staffMemberId: 's',
    items: [],
    refundCardCents: cents,
    refundCashCents: 0,
    initialStatus: 'SETTLED',
    status: 'SETTLED',
    refundedAt,
    settledAt: refundedAt,
    recordedAt: refundedAt,
    ...overrides,
  };
}

const shampoo = (quantity: number) => item('p-shampoo', 'Shampooing doux', 15, quantity);
const oil = (quantity: number) => item('p-oil', 'Huile cuticules', 12.5, quantity);

const none: CashRegisterSources = { appointments: [], sales: [] };

/** The breakdown, checked against the Caisse total of the same window every time. */
function breakdown(sources: CashRegisterSources, interval: CashRegisterInterval = today) {
  const result = getCashRegisterPeriodBreakdown(sources, interval);
  expect(result.totalCents).toBe(getCashRegisterIntervalSummary(sources, interval).totalCents);
  expect(result.appointmentCents + result.productSaleCents - result.refundCents).toBe(result.totalCents);
  return result;
}

describe('getCashRegisterPeriodBreakdown — the « Encaissements » of a summary', () => {
  it('Appointments only: checkouts and the deposits received in the window', () => {
    const result = breakdown({
      ...none,
      appointments: [paid('a', at(4, 9), 9000, at(4, 10)), paid('b', at(4, 14), 6000, at(4, 15))],
      deposits: [deposit('d', at(4, 8), 2000), deposit('v', at(4, 8), 500, 'VOIDED')],
    });
    expect(result).toMatchObject({
      appointmentCents: 17000,
      productSaleCents: 0,
      refundCents: 0,
      refundCount: 0,
      totalCents: 17000,
      productUnitCount: 0,
      reventeUnitCount: 0,
    });
  });

  it('product sales only: the money and the units of every line', () => {
    const result = breakdown({
      ...none,
      sales: [directSale('s1', at(4, 11), [shampoo(2), oil(1)]), directSale('s2', at(4, 16), [oil(2)])],
    });
    expect(result.appointmentCents).toBe(0);
    expect(result.productSaleCents).toBe(3000 + 1250 + 2500);
    expect(result.totalCents).toBe(6750);
    // Most units first; one line per product.
    // 2 shampoos + 1 oil, then 2 oils: 5 physical units, never 2 distinct products.
    expect(result.productUnitCount).toBe(5);
  });

  it('counts physical units: Shampooing ×3 + Masque ×2 + Huile ×1 = 6, one product ×4 = 4', () => {
    const mask = (quantity: number) => item('p-mask', 'Masque', 20, quantity);
    expect(breakdown({ ...none, sales: [directSale('s', at(4, 11), [shampoo(3), mask(2), oil(1)])] }).productUnitCount).toBe(6);
    expect(breakdown({ ...none, sales: [directSale('s', at(4, 11), [shampoo(4)])] })).toMatchObject({
      productUnitCount: 4,
      productSaleCents: 6000,
    });
    expect(breakdown({ ...none, sales: [directSale('s', at(4, 11), [oil(1)])] }).productUnitCount).toBe(1);
  });

  it('mixed: 150 € of Appointments + 45 € of products = 195 €, each identified', () => {
    const result = breakdown({
      appointments: [paid('a', at(4, 9), 9000, at(4, 10)), paid('b', at(4, 14), 6000, at(4, 15))],
      sales: [directSale('s', at(4, 11), [shampoo(3)])],
    });
    expect(result).toMatchObject({ appointmentCents: 15000, productSaleCents: 4500, totalCents: 19500 });
    expect(result.productUnitCount).toBe(3);
  });

  it('then a 10 € product refund: 185 €, the refund named once — never double counted', () => {
    const sources: CashRegisterSources = {
      appointments: [paid('a', at(4, 9), 15000, at(4, 10))],
      sales: [directSale('s', at(4, 11), [shampoo(3)])],
      saleAdjustments: [refund('r', 's', 1000, at(4, 17))],
    };
    const result = breakdown(sources);
    expect(result).toMatchObject({
      appointmentCents: 15000,
      productSaleCents: 4500,
      refundCents: 1000,
      refundCount: 1,
      totalCents: 18500,
    });
    // The units sold are what was sold: a refund is money, never a returned unit.
    expect(result.productUnitCount).toBe(3);
    expect(getCashRegisterDaySummary(sources, day).totalCents).toBe(18500);
  });

  it('a full refund brings the product money back to zero', () => {
    const result = breakdown({
      ...none,
      sales: [directSale('s', at(4, 11), [shampoo(3)])],
      saleAdjustments: [refund('r', 's', 4500, at(4, 17))],
    });
    expect(result).toMatchObject({ productSaleCents: 4500, refundCents: 4500, totalCents: 0 });
  });

  it('pending and voided refunds move nothing; a reversal brings the money back', () => {
    const sale = directSale('s', at(4, 11), [shampoo(3)]);
    const pending = refund('p', 's', 500, at(4, 12), { initialStatus: 'PENDING', status: 'PENDING', refundedAt: undefined, settledAt: undefined });
    const voided = refund('v', 's', 700, at(4, 12), { status: 'VOIDED', voidedAt: at(4, 13) });
    expect(breakdown({ ...none, sales: [sale], saleAdjustments: [pending, voided] })).toMatchObject({
      refundCents: 0,
      refundCount: 0,
      totalCents: 4500,
    });

    const settled = refund('r', 's', 1200, at(4, 14));
    const back = refund('back', 's', 1200, at(4, 17), { kind: 'REVERSAL', reason: 'REFUND_RETURNED', reversesAdjustmentId: 'r' });
    expect(breakdown({ ...none, sales: [sale], saleAdjustments: [settled, back] })).toMatchObject({
      refundCents: 0,
      refundCount: 2,
      totalCents: 4500,
    });
  });

  it('an exceptional outflow is money given back like any refund', () => {
    const sale = directSale('s', at(4, 11), [shampoo(1)]);
    const saleAdjustments = [
      refund('a', 's', 1200, at(4, 15)),
      refund('b', 's', 1000, at(4, 16), { status: 'VOIDED', voidedAt: at(4, 16) }),
      refund('b-outflow', 's', 1000, at(4, 16)),
    ];
    expect(breakdown({ ...none, sales: [sale], saleAdjustments })).toMatchObject({
      productSaleCents: 1500,
      refundCents: 2200,
      refundCount: 2,
      totalCents: -700,
    });
  });

  it('an unpaid historical Sale is never collected revenue, and names no product', () => {
    const unpaid: Sale = { id: 'old', businessId: 'b', completedAt: at(4, 11), items: [shampoo(2)] };
    expect(breakdown({ ...none, sales: [unpaid] })).toMatchObject({ productSaleCents: 0, totalCents: 0, productUnitCount: 0 });
  });

  it('a Revente stays inside its Appointment checkout: counted once, its units said apart', () => {
    const revente: Sale = {
      id: 'revente',
      businessId: 'b',
      clientId: 'client-a',
      appointmentId: 'a',
      completedAt: at(4, 10),
      items: [oil(2)],
    };
    // Services 75 € + products 25 € received as ONE checkout of 100 €.
    const result = breakdown({ appointments: [paid('a', at(4, 9), 10000, at(4, 10))], sales: [revente] });
    expect(result).toMatchObject({ appointmentCents: 10000, productSaleCents: 0, totalCents: 10000, productUnitCount: 0, reventeUnitCount: 2 });
  });

  it('refunds — partial, full, pending, voided or reversed — never change the units sold', () => {
    const sale = directSale('s', at(4, 11), [shampoo(3)]);
    const pending = refund('p', 's', 500, at(4, 12), { initialStatus: 'PENDING', status: 'PENDING', refundedAt: undefined, settledAt: undefined });
    const voided = refund('v', 's', 700, at(4, 12), { status: 'VOIDED', voidedAt: at(4, 13) });
    const full = refund('f', 's', 4500, at(4, 14));
    const result = breakdown({ ...none, sales: [sale], saleAdjustments: [pending, voided, full] });
    expect(result).toMatchObject({ productUnitCount: 3, productSaleCents: 4500, refundCents: 4500, refundCount: 1, totalCents: 0 });
  });

  describe('reporting boundaries — the local civil day or Agenda week of the MONEY', () => {
    it('day: 23:59 the day before and 00:00 the day after are out', () => {
      const sources: CashRegisterSources = {
        ...none,
        sales: [
          directSale('late', at(3, 23, 59), [shampoo(1)]),
          directSale('in', at(4, 0, 0), [oil(1)]),
          directSale('next', at(5, 0, 0), [shampoo(4)]),
        ],
      };
      expect(breakdown(sources)).toMatchObject({ productSaleCents: 1250, productUnitCount: 1 });
    });

    it('sold one day, refunded the next: each day keeps its own movement, the week nets them', () => {
      const sources: CashRegisterSources = {
        appointments: [paid('a', at(3, 9), 15000, at(3, 10))],
        sales: [directSale('s', at(3, 11), [shampoo(3)])],
        saleAdjustments: [refund('r', 's', 1000, at(5, 10))],
      };
      expect(breakdown(sources, getCashRegisterDayInterval(at(3, 12)))).toMatchObject({ totalCents: 19500, refundCents: 0 });
      expect(breakdown(sources, getCashRegisterDayInterval(at(5, 12)))).toMatchObject({
        appointmentCents: 0,
        productSaleCents: 0,
        refundCents: 1000,
        totalCents: -1000,
        productUnitCount: 0,
      });
      expect(breakdown(sources, week)).toMatchObject({ appointmentCents: 15000, productSaleCents: 4500, refundCents: 1000, totalCents: 18500 });
    });

    it('week: Monday 00:00 → Sunday 23:59 of the Agenda week, the next Monday out', () => {
      const sources: CashRegisterSources = {
        ...none,
        sales: [
          directSale('sun-before', at(1, 23, 59), [shampoo(1)]),
          directSale('monday', at(2, 0, 0), [oil(1)]),
          directSale('sunday', at(8, 23, 59), [oil(1)]),
          directSale('next-monday', at(9, 0, 0), [shampoo(1)]),
        ],
      };
      expect(breakdown(sources, week)).toMatchObject({ productSaleCents: 2500, productUnitCount: 2 });
    });

    it('a week across a DST change keeps its local bounds', () => {
      // Europe ends summer time on Sunday 25 October 2026: that week still runs Mon 19 → Sun 25.
      const dstWeek = getCashRegisterDaysInterval(new Date(2026, 9, 19), new Date(2026, 9, 25));
      expect(dstWeek.start).toEqual(new Date(2026, 9, 19, 0, 0));
      expect(dstWeek.end).toEqual(new Date(2026, 9, 26, 0, 0));
      const sources: CashRegisterSources = {
        ...none,
        sales: [
          directSale('sun', new Date(2026, 9, 25, 23, 30), [oil(1)]),
          directSale('mon', new Date(2026, 9, 26, 0, 0), [shampoo(1)]),
        ],
      };
      expect(breakdown(sources, dstWeek)).toMatchObject({ productSaleCents: 1250 });
    });
  });

  it('the week is the sum of its seven days, to the cent', () => {
    const sources: CashRegisterSources = {
      appointments: [paid('a', at(2, 9), 4550, at(2, 10)), paid('b', at(6, 9), 3333, at(6, 10))],
      sales: [directSale('s1', at(3, 11), [oil(3)]), directSale('s2', at(8, 19), [shampoo(1)])],
      deposits: [deposit('d', at(7, 8), 1001)],
      saleAdjustments: [refund('r', 's1', 1250, at(8, 20))],
    };
    const weekly = breakdown(sources, week);
    const daily = [2, 3, 4, 5, 6, 7, 8].map((date) => breakdown(sources, getCashRegisterDayInterval(at(date, 12))));
    const sum = (key: 'appointmentCents' | 'productSaleCents' | 'refundCents' | 'totalCents') =>
      daily.reduce((cents, result) => cents + result[key], 0);
    expect(weekly.appointmentCents).toBe(sum('appointmentCents'));
    expect(weekly.productSaleCents).toBe(sum('productSaleCents'));
    expect(weekly.refundCents).toBe(sum('refundCents'));
    expect(weekly.totalCents).toBe(sum('totalCents'));
    expect(weekly.productUnitCount).toBe(daily.reduce((units, result) => units + result.productUnitCount, 0));
    expect(weekly.productUnitCount).toBe(4);
    expect(weekly.totalCents).toBe(4550 + 3333 + 3750 + 1500 + 1001 - 1250);
  });
});
