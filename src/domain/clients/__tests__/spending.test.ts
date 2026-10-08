import type { Appointment, AppointmentItem, AppointmentStatus } from '../../appointments';
import { getBusinessInsights, getInsightsPeriod } from '../../insights';
import type { Sale, SaleItem } from '../../sales';
import {
  getAppointmentClientSpendingCents,
  getClientTotalSpentCents,
  getSaleClientSpendingCents,
  type ClientSpendingSources,
} from '..';

const SEPTEMBER = getInsightsPeriod('MONTH', new Date(2026, 8, 15));

function item(price: number, order = 0): AppointmentItem {
  return {
    id: `item-${order}`,
    serviceId: 'care',
    order,
    serviceName: 'Soin',
    serviceType: 'SERVICE',
    price,
    phases: [{ id: 'p', name: 'Soin', durationMinutes: 30, requiresStaff: true }],
  };
}

function visit(id: string, clientId: string, price: number, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId,
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 10, 10, 0),
    status: 'COMPLETED',
    items: [item(price)],
    ...overrides,
  };
}

function line(productId: string, unitPrice: number, quantity = 1): SaleItem {
  return { id: `${productId}-line`, productId, productName: 'Huile', unitPrice, quantity };
}

function sale(id: string, items: readonly SaleItem[], overrides: Partial<Sale> = {}): Sale {
  return { id, businessId: 'business-a', completedAt: new Date(2026, 8, 15, 15, 0), items, ...overrides };
}

/** A paid standalone Sale (Produits → Nouvelle vente). */
function purchase(id: string, clientId: string | undefined, euros: number, at = new Date(2026, 8, 15, 15, 0)): Sale {
  return sale(id, [line(`product-${id}`, euros)], {
    clientId,
    completedAt: at,
    payment: { paidAt: at, cardAmountCents: euros * 100, cashAmountCents: 0 },
  });
}

/** A Sale sold during an Appointment (« Revente »): never a payment of its own. */
function revente(id: string, appointmentId: string, clientId: string, euros: number): Sale {
  return sale(id, [line(`product-${id}`, euros)], { clientId, appointmentId });
}

function sources(partial: Partial<ClientSpendingSources>): ClientSpendingSources {
  return { appointments: [], sales: [], ...partial };
}

describe('getClientTotalSpentCents — « Total dépensé »', () => {
  it('services only: the completed visits of the client', () => {
    const data = sources({ appointments: [visit('a', 'amel', 100), visit('b', 'amel', 80), visit('c', 'nadia', 500)] });
    expect(getClientTotalSpentCents(data, 'amel')).toBe(18000);
  });

  it('a standalone product purchase only: its snapshot lines', () => {
    const paidAt = new Date(2026, 8, 15);
    const data = sources({
      sales: [
        sale('s', [line('oil', 25, 2), line('mask', 20, 1)], {
          clientId: 'amel',
          payment: { paidAt, cardAmountCents: 7000, cashAmountCents: 0 },
        }),
      ],
    });
    expect(getClientTotalSpentCents(data, 'amel')).toBe(7000);
  });

  it('adds services and products: 180 € + 70 € = 250 €', () => {
    const data = sources({ appointments: [visit('a', 'amel', 180)], sales: [purchase('s', 'amel', 70)] });
    expect(getClientTotalSpentCents(data, 'amel')).toBe(25000);
  });

  it('counts a « Revente » exactly once, through its Appointment', () => {
    const paidAt = new Date(2026, 8, 10, 11);
    const data = sources({
      // One checkout received services + product together.
      appointments: [visit('a', 'amel', 100, { payment: { paidAt, cardAmountCents: 13000, cashAmountCents: 0 } })],
      sales: [revente('linked', 'a', 'amel', 30)],
    });
    expect(getClientTotalSpentCents(data, 'amel')).toBe(13000);
    expect(getSaleClientSpendingCents(data.sales[0])).toBe(0);
  });

  it('applies the discount to the services only, never to the products', () => {
    const percent = sources({
      appointments: [visit('a', 'amel', 100, { discount: { type: 'PERCENT', percent: 20 } })],
      sales: [revente('linked', 'a', 'amel', 30), purchase('s', 'amel', 50)],
    });
    // 100 € − 20 % + 30 € sold during the visit + 50 € standalone.
    expect(getClientTotalSpentCents(percent, 'amel')).toBe(8000 + 3000 + 5000);

    const fixed = sources({
      appointments: [visit('a', 'amel', 100, { discount: { type: 'FIXED', amountCents: 1500 } })],
    });
    expect(getClientTotalSpentCents(fixed, 'amel')).toBe(8500);
  });

  it('excludes a standalone Sale with no recorded payment, and invents none', () => {
    const historical = sale('s', [line('oil', 400)], { clientId: 'amel' });
    expect(getSaleClientSpendingCents(historical)).toBe(0);
    expect(getClientTotalSpentCents(sources({ sales: [historical] }), 'amel')).toBe(0);
    expect(historical.payment).toBeUndefined();
  });

  it('gives an anonymous Sale to nobody', () => {
    const walkIn = purchase('walk-in', undefined, 400);
    expect(getSaleClientSpendingCents(walkIn)).toBe(0);
    expect(getClientTotalSpentCents(sources({ sales: [walkIn] }), 'amel')).toBe(0);
  });

  it.each<AppointmentStatus>(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'])(
    'excludes a %s Appointment together with the products sold during it',
    (status) => {
      const data = sources({
        appointments: [visit('a', 'amel', 100, { status }), visit('b', 'amel', 40)],
        sales: [revente('linked', 'a', 'amel', 30)],
      });
      expect(getAppointmentClientSpendingCents(data.appointments[0], data.sales)).toBe(0);
      expect(getClientTotalSpentCents(data, 'amel')).toBe(4000);
    },
  );

  it('a deposit is a way of paying: 30 € deposit + 70 € checkout is 100 €', () => {
    const paid = visit('a', 'amel', 100, {
      payment: { paidAt: new Date(2026, 8, 10, 11), cardAmountCents: 7000, cashAmountCents: 0 },
    });
    // Deposits are not an input of the rule at all.
    expect(getClientTotalSpentCents(sources({ appointments: [paid] }), 'amel')).toBe(10000);
  });

  it('never mixes clients, whatever the display names', () => {
    const data = sources({
      appointments: [visit('a', 'amel', 100), visit('b', 'nadia', 60)],
      sales: [purchase('s1', 'nadia', 20), purchase('s2', 'amel', 5)],
    });
    expect(getClientTotalSpentCents(data, 'amel')).toBe(10500);
    expect(getClientTotalSpentCents(data, 'nadia')).toBe(8000);
    expect(getClientTotalSpentCents(data, 'unknown')).toBe(0);
  });
});

describe('profile « Total dépensé » and Tops & tendances share one spending rule', () => {
  // Every kind of record at once, all inside September.
  const paidAt = new Date(2026, 8, 10, 11);
  const september = sources({
    appointments: [
      visit('a1', 'amel', 180, { discount: { type: 'PERCENT', percent: 10 } }),
      visit('a2', 'amel', 50, { status: 'CANCELLED' }),
      visit('a3', 'amel', 90, { status: 'NO_SHOW' }),
      visit('b1', 'bea', 220, { payment: { paidAt, cardAmountCents: 22000, cashAmountCents: 0 } }),
      visit('c1', 'chloe', 10, { status: 'SCHEDULED' }),
    ],
    sales: [
      revente('r1', 'a1', 'amel', 30),
      revente('r2', 'a2', 'amel', 999),
      revente('r3', 'c1', 'chloe', 15),
      purchase('p1', 'amel', 70),
      purchase('p2', undefined, 400),
      sale('unpaid', [line('oil', 300)], { clientId: 'bea' }),
    ],
  });

  it('same data, same period: the ranking shows exactly the profile totals', () => {
    const ranking = getBusinessInsights(september, SEPTEMBER).topSpendingClients;
    expect(ranking.map((row) => [row.clientId, row.spendingCents])).toEqual([
      // 180 € − 10 % + 30 € Revente + 70 € standalone.
      ['amel', 26200],
      ['bea', 22000],
    ]);
    for (const row of ranking) {
      expect(row.spendingCents).toBe(getClientTotalSpentCents(september, row.clientId));
    }
    expect(getClientTotalSpentCents(september, 'chloe')).toBe(0);
  });

  it('the profile is the whole history, the ranking one period: only the scope differs', () => {
    const history = sources({
      appointments: [
        ...september.appointments,
        visit('old', 'amel', 300, { startAt: new Date(2026, 5, 2, 10) }),
      ],
      sales: [...september.sales, purchase('old-sale', 'amel', 45, new Date(2026, 6, 20, 15))],
    });

    // September ranking is untouched by the older records…
    expect(getBusinessInsights(history, SEPTEMBER).topSpendingClients[0]).toMatchObject({
      clientId: 'amel',
      spendingCents: 26200,
    });
    // …which the lifetime total adds: 262 € + 300 € + 45 €.
    expect(getClientTotalSpentCents(history, 'amel')).toBe(60700);

    // A period wide enough to hold the whole history gives the lifetime total back.
    const year = getInsightsPeriod('YEAR', new Date(2026, 8, 15));
    expect(getBusinessInsights(history, year).topSpendingClients[0]).toMatchObject({
      clientId: 'amel',
      spendingCents: 60700,
    });
  });
});
