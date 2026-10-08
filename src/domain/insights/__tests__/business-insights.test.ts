import type { Appointment, AppointmentDeposit, AppointmentItem } from '../../appointments';
import {
  getCashRegisterDaySummary,
  getCashRegisterMonthSummary,
} from '../../cash-register';
import type { Sale, SaleItem } from '../../sales';
import { getBusinessInsights, getInsightsPeriod, type BusinessInsightsSources } from '..';

const SEPTEMBER = getInsightsPeriod('MONTH', new Date(2026, 8, 22));
const OCTOBER = getInsightsPeriod('MONTH', new Date(2026, 9, 5));

function item(serviceId: string, serviceName: string, price: number, order = 0): AppointmentItem {
  return {
    id: `${serviceId}-${order}`,
    serviceId,
    order,
    serviceName,
    serviceType: 'SERVICE',
    price,
    phases: [{ id: 'p', name: serviceName, durationMinutes: 30, requiresStaff: true }],
  };
}

function appointment(id: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id,
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 10, 10, 0),
    status: 'COMPLETED',
    items: [item('cut', 'Coupe', 100)],
    ...overrides,
  };
}

function line(productId: string, productName: string, quantity = 1, unitPrice = 20): SaleItem {
  return { id: `${productId}-${quantity}-${productName}`, productId, productName, unitPrice, quantity };
}

function sale(id: string, completedAt: Date, items: readonly SaleItem[], overrides: Partial<Sale> = {}): Sale {
  return { id, businessId: 'business-a', completedAt, items, ...overrides };
}

function deposit(id: string, appointmentId: string, overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit {
  const paidAt = overrides.paidAt ?? new Date(2026, 8, 22, 11, 0);
  return {
    id,
    businessId: 'business-a',
    appointmentId,
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt,
    status: 'ACTIVE',
    createdAt: paidAt,
    ...overrides,
  };
}

function sources(partial: Partial<BusinessInsightsSources>): BusinessInsightsSources {
  return { appointments: [], sales: [], deposits: [], ...partial };
}

describe('getBusinessInsights — Encaissé (money received, by payment date)', () => {
  it('counts a deposit in the period it was paid, never again in the Appointment period', () => {
    const october = new Date(2026, 9, 5, 10, 0);
    const booked = appointment('a', {
      startAt: october,
      payment: { paidAt: new Date(2026, 9, 5, 11, 0), cardAmountCents: 7000, cashAmountCents: 0 },
    });
    const data = sources({ appointments: [booked], deposits: [deposit('d', 'a')] });

    expect(getBusinessInsights(data, SEPTEMBER).cash.totalCents).toBe(3000);
    // October: only the NEW money of the final checkout.
    expect(getBusinessInsights(data, OCTOBER).cash.totalCents).toBe(7000);
  });

  it('counts final checkouts and standalone Sale payments, split by method', () => {
    const paidAt = new Date(2026, 8, 12, 12, 0);
    const data = sources({
      appointments: [appointment('a', { payment: { paidAt, cardAmountCents: 6000, cashAmountCents: 4000 } })],
      sales: [
        sale('s', paidAt, [line('p', 'Shampooing')], {
          payment: { paidAt, cardAmountCents: 0, cashAmountCents: 2000 },
        }),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).cash).toEqual({
      totalCents: 12000,
      cardCents: 6000,
      cashCents: 6000,
      checkoutCount: 2,
    });
  });

  it('never counts a Sale sold during an Appointment on its own: the checkout already holds it', () => {
    const paidAt = new Date(2026, 8, 12, 12, 0);
    const data = sources({
      appointments: [appointment('a', { payment: { paidAt, cardAmountCents: 12000, cashAmountCents: 0 } })],
      sales: [sale('linked', paidAt, [line('p', 'Masque')], { appointmentId: 'a' })],
    });
    expect(getBusinessInsights(data, SEPTEMBER).cash.totalCents).toBe(12000);
  });

  it('a VOIDED deposit adds nothing', () => {
    const data = sources({
      appointments: [appointment('a', { status: 'SCHEDULED', startAt: new Date(2026, 9, 5) })],
      deposits: [deposit('d', 'a', { status: 'VOIDED', voidedAt: new Date(2026, 8, 23) })],
    });
    expect(getBusinessInsights(data, SEPTEMBER).cash.totalCents).toBe(0);
  });

  it('a deposit kept on a cancelled Appointment is still money received — until it is voided', () => {
    const cancelled = appointment('a', {
      status: 'CANCELLED',
      startAt: new Date(2026, 8, 25, 10, 0),
      cancellation: { cancelledAt: new Date(2026, 8, 24), cancelledBy: 'CLIENT' },
    });
    const kept = getBusinessInsights(
      sources({ appointments: [cancelled], deposits: [deposit('d', 'a')] }),
      SEPTEMBER,
    );
    expect(kept.cash.totalCents).toBe(3000);
    expect(kept.completedAppointmentCount).toBe(0);
    expect(kept.topServices).toEqual([]);
    expect(kept.topLoyalClients).toEqual([]);

    const voided = getBusinessInsights(
      sources({
        appointments: [cancelled],
        deposits: [deposit('d', 'a', { status: 'VOIDED', voidedAt: new Date(2026, 8, 26) })],
      }),
      SEPTEMBER,
    );
    expect(voided.cash.totalCents).toBe(0);
  });

  it('matches the Cash Register summary of the same day and month', () => {
    const data = sources({
      appointments: [
        appointment('a', {
          payment: { paidAt: new Date(2026, 8, 22, 23, 59), cardAmountCents: 4200, cashAmountCents: 800 },
        }),
        appointment('b', {
          payment: { paidAt: new Date(2026, 8, 23, 0, 0), cardAmountCents: 1000, cashAmountCents: 0 },
        }),
        appointment('c', { status: 'SCHEDULED', startAt: new Date(2026, 9, 3) }),
      ],
      sales: [
        sale('s', new Date(2026, 8, 30, 18), [line('p', 'Huile')], {
          payment: { paidAt: new Date(2026, 8, 30, 18), cardAmountCents: 2500, cashAmountCents: 0 },
        }),
      ],
      deposits: [deposit('d', 'c', { paidAt: new Date(2026, 8, 22, 9, 0) })],
    });
    const cashSources = { appointments: data.appointments, sales: data.sales, deposits: data.deposits };
    const day = new Date(2026, 8, 22);

    expect(getBusinessInsights(data, getInsightsPeriod('DAY', day)).cash).toEqual(
      getCashRegisterDaySummary(cashSources, day),
    );
    expect(getBusinessInsights(data, SEPTEMBER).cash).toEqual(getCashRegisterMonthSummary(cashSources, day));
  });
});

describe('getBusinessInsights — appointment activity (by appointment date)', () => {
  it('counts COMPLETED Appointments only', () => {
    const at = new Date(2026, 8, 10, 10, 0);
    const data = sources({
      appointments: [
        appointment('completed', { startAt: at }),
        appointment('scheduled', { startAt: at, status: 'SCHEDULED' }),
        appointment('confirmed', { startAt: at, status: 'CONFIRMED' }),
        appointment('in-progress', { startAt: at, status: 'IN_PROGRESS' }),
        appointment('cancelled', {
          startAt: at,
          status: 'CANCELLED',
          cancellation: { cancelledAt: at, cancelledBy: 'BUSINESS' },
        }),
        appointment('no-show', { startAt: at, status: 'NO_SHOW', noShow: { recordedAt: at } }),
      ],
    });
    const insights = getBusinessInsights(data, SEPTEMBER);
    expect(insights.completedAppointmentCount).toBe(1);
    expect(insights.completedAppointmentValueCents).toBe(10000);
    expect(insights.averageAppointmentValueCents).toBe(10000);
  });

  it('the appointment date decides, not the checkout date', () => {
    const lastEvening = appointment('a', {
      startAt: new Date(2026, 8, 30, 19, 0),
      payment: { paidAt: new Date(2026, 9, 1, 9, 0), cardAmountCents: 10000, cashAmountCents: 0 },
    });
    const data = sources({ appointments: [lastEvening] });

    const september = getBusinessInsights(data, SEPTEMBER);
    expect(september.completedAppointmentCount).toBe(1);
    expect(september.cash.totalCents).toBe(0);

    const october = getBusinessInsights(data, OCTOBER);
    expect(october.completedAppointmentCount).toBe(0);
    expect(october.cash.totalCents).toBe(10000);
  });

  it('values an Appointment net of its discount, with its linked Sales', () => {
    const discounted = appointment('a', { discount: { type: 'PERCENT', percent: 20 } });
    const data = sources({
      appointments: [discounted],
      sales: [sale('linked', new Date(2026, 8, 10, 11), [line('p', 'Masque', 1, 15)], { appointmentId: 'a' })],
    });
    const insights = getBusinessInsights(data, SEPTEMBER);
    expect(insights.completedAppointmentValueCents).toBe(8000 + 1500);
    // Client spending is that same value: the checkout paid the product too.
    expect(insights.topSpendingClients).toEqual([
      { clientId: 'client-a', spendingCents: 9500, completedAppointmentCount: 1 },
    ]);
  });

  it('a deposit never increases the value: 100 € = 30 € deposit + 70 € checkout', () => {
    const settled = appointment('a', {
      startAt: new Date(2026, 8, 25, 10, 0),
      payment: { paidAt: new Date(2026, 8, 25, 11, 0), cardAmountCents: 7000, cashAmountCents: 0 },
    });
    const insights = getBusinessInsights(
      sources({ appointments: [settled], deposits: [deposit('d', 'a', { paidAt: new Date(2026, 8, 2) })] }),
      SEPTEMBER,
    );
    expect(insights.completedAppointmentValueCents).toBe(10000);
    expect(insights.averageAppointmentValueCents).toBe(10000);
    expect(insights.topSpendingClients[0]?.spendingCents).toBe(10000);
    expect(insights.cash.totalCents).toBe(10000);
  });

  it('a fully prepaid Appointment is valued once', () => {
    const prepaid = appointment('a', { startAt: new Date(2026, 9, 5, 10, 0) });
    const data = sources({
      appointments: [prepaid],
      deposits: [deposit('d', 'a', { amountCents: 10000, paidAt: new Date(2026, 8, 22) })],
    });
    const october = getBusinessInsights(data, OCTOBER);
    expect(october.completedAppointmentValueCents).toBe(10000);
    expect(october.cash.totalCents).toBe(0);
    expect(getBusinessInsights(data, SEPTEMBER).cash.totalCents).toBe(10000);
  });

  it('rounds the average to the cent, and is 0 without completed Appointments', () => {
    const data = sources({
      appointments: [
        appointment('a', { items: [item('x', 'X', 10)] }),
        appointment('b', { items: [item('x', 'X', 10)] }),
        appointment('c', { items: [item('x', 'X', 10.01)] }),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).averageAppointmentValueCents).toBe(1000);
    expect(getBusinessInsights(data, OCTOBER).averageAppointmentValueCents).toBe(0);
  });
});

describe('getBusinessInsights — top services', () => {
  it('counts each completed item and ranks by count', () => {
    const data = sources({
      appointments: [
        appointment('a', { items: [item('balayage', 'Balayage', 120), item('cut', 'Coupe', 40, 1)] }),
        appointment('b', { items: [item('balayage', 'Balayage', 120)] }),
        appointment('c', { items: [item('balayage', 'Balayage', 120), item('gloss', 'Gloss', 30, 1)] }),
        appointment('d', { items: [item('cut', 'Coupe', 40)] }),
        appointment('e', { items: [item('brushing', 'Brushing', 30)] }),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topServices).toEqual([
      { serviceId: 'balayage', serviceName: 'Balayage', count: 3 },
      { serviceId: 'cut', serviceName: 'Coupe', count: 2 },
      // Brushing and Gloss tie at 1: alphabetical, stable.
      { serviceId: 'brushing', serviceName: 'Brushing', count: 1 },
    ]);
  });

  it('ignores cancelled and no-show visits, and Appointments outside the period', () => {
    const data = sources({
      appointments: [
        appointment('a', { status: 'CANCELLED', items: [item('x', 'X', 1)] }),
        appointment('b', { status: 'NO_SHOW', items: [item('x', 'X', 1)] }),
        appointment('c', { startAt: new Date(2026, 7, 31, 23, 59), items: [item('x', 'X', 1)] }),
        appointment('d', { startAt: new Date(2026, 9, 1, 0, 0), items: [item('x', 'X', 1)] }),
        appointment('e', { startAt: new Date(2026, 8, 1, 0, 0), items: [item('y', 'Y', 1)] }),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topServices).toEqual([
      { serviceId: 'y', serviceName: 'Y', count: 1 },
    ]);
  });

  it('keeps the same order whatever the input order', () => {
    const appointments = ['c', 'b', 'a'].map((id) =>
      appointment(id, { items: [item(`service-${id}`, `Soin ${id.toUpperCase()}`, 10)] }),
    );
    const forward = getBusinessInsights(sources({ appointments }), SEPTEMBER).topServices;
    const reversed = getBusinessInsights(sources({ appointments: [...appointments].reverse() }), SEPTEMBER).topServices;
    expect(forward.map((row) => row.serviceName)).toEqual(['Soin A', 'Soin B', 'Soin C']);
    expect(reversed).toEqual(forward);
  });

  it('names a Service from its snapshots in the period, never the current catalog', () => {
    const data = sources({
      appointments: [
        appointment('old', { startAt: new Date(2026, 7, 10), items: [item('color', 'Couleur', 60)] }),
        appointment('new1', { startAt: new Date(2026, 8, 5), items: [item('color', 'Coloration', 60)] }),
        appointment('new2', { startAt: new Date(2026, 8, 3), items: [item('color', 'Couleur', 60)] }),
      ],
    });
    expect(getBusinessInsights(data, getInsightsPeriod('MONTH', new Date(2026, 7, 1))).topServices).toEqual([
      { serviceId: 'color', serviceName: 'Couleur', count: 1 },
    ]);
    // Both names in September: the most recent snapshot names the row, the count is shared.
    expect(getBusinessInsights(data, SEPTEMBER).topServices).toEqual([
      { serviceId: 'color', serviceName: 'Coloration', count: 2 },
    ]);
  });
});

describe('getBusinessInsights — top products (by sale date)', () => {
  it('adds standalone and appointment-linked Sales once each, with their quantities', () => {
    const at = new Date(2026, 8, 12, 12, 0);
    const data = sources({
      appointments: [appointment('a')],
      sales: [
        sale('standalone', at, [line('shampoo', 'Shampooing', 2), line('oil', 'Huile', 1)]),
        sale('linked', at, [line('shampoo', 'Shampooing', 3)], { appointmentId: 'a' }),
        sale('mask', at, [line('mask', 'Masque', 4)]),
      ],
    });
    const insights = getBusinessInsights(data, SEPTEMBER);
    expect(insights.topProducts).toEqual([
      { productId: 'shampoo', productName: 'Shampooing', unitCount: 5 },
      { productId: 'mask', productName: 'Masque', unitCount: 4 },
      { productId: 'oil', productName: 'Huile', unitCount: 1 },
    ]);
    expect(insights.soldProductUnitCount).toBe(10);
  });

  it('uses the sale date, not the appointment date, and respects period bounds', () => {
    const data = sources({
      appointments: [appointment('a', { startAt: new Date(2026, 8, 30, 18) })],
      sales: [
        sale('linked-late', new Date(2026, 9, 1, 0, 0), [line('p', 'Masque')], { appointmentId: 'a' }),
        sale('edge', new Date(2026, 8, 30, 23, 59), [line('q', 'Huile')]),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topProducts.map((row) => row.productId)).toEqual(['q']);
    expect(getBusinessInsights(data, OCTOBER).topProducts.map((row) => row.productId)).toEqual(['p']);
  });

  it('breaks ties by name, then id, and keeps historical names', () => {
    const data = sources({
      sales: [
        sale('s1', new Date(2026, 8, 2), [line('b', 'Baume'), line('a', 'Argile')]),
        sale('s2', new Date(2026, 8, 20), [line('z', 'Argile')]),
        sale('old', new Date(2026, 7, 20), [line('b', 'Ancien baume')]),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topProducts).toEqual([
      { productId: 'a', productName: 'Argile', unitCount: 1 },
      { productId: 'z', productName: 'Argile', unitCount: 1 },
      { productId: 'b', productName: 'Baume', unitCount: 1 },
    ]);
    expect(
      getBusinessInsights(data, getInsightsPeriod('MONTH', new Date(2026, 7, 1))).topProducts[0]?.productName,
    ).toBe('Ancien baume');
  });
});

describe('getBusinessInsights — client rankings', () => {
  const visit = (id: string, clientId: string, price: number, overrides: Partial<Appointment> = {}) =>
    appointment(id, { clientId, items: [item('s', 'Soin', price)], ...overrides });

  it('ranks the service spending of COMPLETED Appointments, scoped to the period', () => {
    const data = sources({
      appointments: [
        visit('a1', 'amel', 300),
        visit('a2', 'amel', 320),
        visit('n1', 'nadia', 510),
        visit('s1', 'sarah', 470),
        visit('x1', 'other', 100),
        visit('old', 'other', 9999, { startAt: new Date(2026, 7, 5) }),
      ],
      // A standalone Sale with no recorded payment is not money spent.
      sales: [sale('p', new Date(2026, 8, 3), [line('p', 'Huile', 1, 400)], { clientId: 'other' })],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topSpendingClients).toEqual([
      { clientId: 'amel', spendingCents: 62000, completedAppointmentCount: 2 },
      { clientId: 'nadia', spendingCents: 51000, completedAppointmentCount: 1 },
      { clientId: 'sarah', spendingCents: 47000, completedAppointmentCount: 1 },
    ]);
  });

  it('never adds a deposit to spending', () => {
    const data = sources({
      appointments: [
        visit('a', 'amel', 100, {
          payment: { paidAt: new Date(2026, 8, 10, 11), cardAmountCents: 7000, cashAmountCents: 0 },
        }),
      ],
      deposits: [deposit('d', 'a', { paidAt: new Date(2026, 8, 1) })],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topSpendingClients[0]?.spendingCents).toBe(10000);
  });

  it('breaks spending ties by completed visits, then by id', () => {
    const data = sources({
      appointments: [
        visit('b1', 'bea', 50),
        visit('b2', 'bea', 50),
        visit('c1', 'chloe', 100),
        visit('a1', 'alice', 100),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topSpendingClients.map((row) => row.clientId)).toEqual([
      'bea',
      'alice',
      'chloe',
    ]);
  });

  it('ranks loyalty by completed visits, then spending, then id', () => {
    const data = sources({
      appointments: [
        visit('a1', 'amel', 10),
        visit('a2', 'amel', 10),
        visit('a3', 'amel', 10),
        visit('s1', 'sonia', 50),
        visit('s2', 'sonia', 50),
        visit('n1', 'nadia', 20),
        visit('n2', 'nadia', 20),
        visit('z1', 'zoe', 20),
        visit('y1', 'yasmine', 20),
      ],
    });
    expect(getBusinessInsights(data, SEPTEMBER).topLoyalClients).toEqual([
      { clientId: 'amel', spendingCents: 3000, completedAppointmentCount: 3 },
      { clientId: 'sonia', spendingCents: 10000, completedAppointmentCount: 2 },
      { clientId: 'nadia', spendingCents: 4000, completedAppointmentCount: 2 },
    ]);
  });

  it('never ranks a client whose visits were only cancelled or missed', () => {
    const data = sources({
      appointments: [
        visit('c', 'ghost', 500, {
          status: 'CANCELLED',
          cancellation: { cancelledAt: new Date(2026, 8, 9), cancelledBy: 'CLIENT' },
        }),
        visit('n', 'ghost', 500, { status: 'NO_SHOW', noShow: { recordedAt: new Date(2026, 8, 10) } }),
        visit('a', 'amel', 40),
      ],
    });
    const insights = getBusinessInsights(data, SEPTEMBER);
    expect(insights.topSpendingClients.map((row) => row.clientId)).toEqual(['amel']);
    expect(insights.topLoyalClients.map((row) => row.clientId)).toEqual(['amel']);
  });

  it('keeps a free completed visit out of the spending ranking but in loyalty', () => {
    const insights = getBusinessInsights(
      sources({ appointments: [visit('a', 'amel', 0)] }),
      SEPTEMBER,
    );
    expect(insights.topSpendingClients).toEqual([]);
    expect(insights.topLoyalClients).toEqual([
      { clientId: 'amel', spendingCents: 0, completedAppointmentCount: 1 },
    ]);
  });

  it('returns empty rankings when nobody is eligible', () => {
    const insights = getBusinessInsights(sources({}), SEPTEMBER);
    expect(insights.topSpendingClients).toEqual([]);
    expect(insights.topLoyalClients).toEqual([]);
  });
});

describe('getBusinessInsights — client spending = services + products', () => {
  const visit = (id: string, clientId: string, price: number, overrides: Partial<Appointment> = {}) =>
    appointment(id, { clientId, items: [item('s', 'Soin', price)], ...overrides });

  /** A paid standalone Sale (Produits → Nouvelle vente) of `euros` for one client. */
  const purchase = (id: string, clientId: string | undefined, euros: number, at = new Date(2026, 8, 15, 15, 0)) =>
    sale(id, at, [line(`product-${id}`, 'Huile', 1, euros)], {
      clientId,
      payment: { paidAt: at, cardAmountCents: euros * 100, cashAmountCents: 0 },
    });

  const spending = (data: BusinessInsightsSources, period = SEPTEMBER) =>
    getBusinessInsights(data, period).topSpendingClients;

  it('a client with Appointments only spends her services', () => {
    expect(spending(sources({ appointments: [visit('a', 'amel', 180)] }))).toEqual([
      { clientId: 'amel', spendingCents: 18000, completedAppointmentCount: 1 },
    ]);
  });

  it('a client with product purchases only is ranked on them, and is never « fidèle »', () => {
    const insights = getBusinessInsights(
      sources({
        sales: [
          sale('s', new Date(2026, 8, 15), [line('oil', 'Huile', 2, 25), line('mask', 'Masque', 1, 20)], {
            clientId: 'nadia',
            payment: { paidAt: new Date(2026, 8, 15), cardAmountCents: 7000, cashAmountCents: 0 },
          }),
        ],
      }),
      SEPTEMBER,
    );
    // Snapshot lines: 2 × 25 € + 1 × 20 €.
    expect(insights.topSpendingClients).toEqual([
      { clientId: 'nadia', spendingCents: 7000, completedAppointmentCount: 0 },
    ]);
    expect(insights.topLoyalClients).toEqual([]);
  });

  it('adds services and products of the same client', () => {
    const data = sources({
      appointments: [visit('a', 'amel', 180)],
      sales: [purchase('s', 'amel', 70)],
    });
    expect(spending(data)).toEqual([
      { clientId: 'amel', spendingCents: 25000, completedAppointmentCount: 1 },
    ]);
  });

  it('product purchases move a client above one with more service spending', () => {
    const appointments = [visit('a', 'client-a', 180), visit('b', 'client-b', 220)];
    expect(spending(sources({ appointments })).map((row) => row.clientId)).toEqual(['client-b', 'client-a']);
    expect(spending(sources({ appointments, sales: [purchase('s', 'client-a', 70)] }))).toEqual([
      { clientId: 'client-a', spendingCents: 25000, completedAppointmentCount: 1 },
      { clientId: 'client-b', spendingCents: 22000, completedAppointmentCount: 1 },
    ]);
  });

  it('an anonymous Sale belongs to no client, and still counts as products sold', () => {
    const insights = getBusinessInsights(
      sources({ appointments: [visit('a', 'amel', 50)], sales: [purchase('walk-in', undefined, 400)] }),
      SEPTEMBER,
    );
    expect(insights.topSpendingClients).toEqual([
      { clientId: 'amel', spendingCents: 5000, completedAppointmentCount: 1 },
    ]);
    expect(insights.soldProductUnitCount).toBe(1);
    expect(insights.cash.totalCents).toBe(40000);
  });

  it('a standalone Sale with no recorded payment is not money spent', () => {
    const unpaid = sale('s', new Date(2026, 8, 15), [line('oil', 'Huile', 1, 400)], { clientId: 'nadia' });
    expect(spending(sources({ sales: [unpaid] }))).toEqual([]);
  });

  it('a Sale sold during an Appointment is counted once, through that Appointment', () => {
    const paidAt = new Date(2026, 8, 10, 11, 0);
    const data = sources({
      appointments: [
        // The checkout received services + product together: 100 € + 30 €.
        visit('a', 'amel', 100, { payment: { paidAt, cardAmountCents: 13000, cashAmountCents: 0 } }),
      ],
      sales: [sale('linked', paidAt, [line('mask', 'Masque', 1, 30)], { clientId: 'amel', appointmentId: 'a' })],
    });
    const insights = getBusinessInsights(data, SEPTEMBER);
    expect(insights.topSpendingClients).toEqual([
      { clientId: 'amel', spendingCents: 13000, completedAppointmentCount: 1 },
    ]);
    // Exactly the appointment value and the money received: nothing twice.
    expect(insights.completedAppointmentValueCents).toBe(13000);
    expect(insights.cash.totalCents).toBe(13000);
  });

  it('the discount still applies to the services only', () => {
    const data = sources({
      appointments: [visit('a', 'amel', 100, { discount: { type: 'PERCENT', percent: 10 } })],
      sales: [
        sale('linked', new Date(2026, 8, 10, 11), [line('mask', 'Masque', 1, 30)], {
          clientId: 'amel',
          appointmentId: 'a',
        }),
      ],
    });
    expect(spending(data)[0]?.spendingCents).toBe(12000);
  });

  it.each(['SCHEDULED', 'CANCELLED', 'NO_SHOW'] as const)(
    'a Sale sold during a %s Appointment was never encashed: it is not spending',
    (status) => {
      const data = sources({
        appointments: [visit('a', 'amel', 100, { status })],
        sales: [
          sale('linked', new Date(2026, 8, 10, 11), [line('mask', 'Masque', 1, 30)], {
            clientId: 'amel',
            appointmentId: 'a',
          }),
        ],
      });
      expect(spending(data)).toEqual([]);
    },
  );

  it('respects the period bounds for both sources: start included, end excluded', () => {
    const data = sources({
      appointments: [
        visit('in', 'amel', 10, { startAt: new Date(2026, 8, 1, 0, 0) }),
        visit('before', 'amel', 1000, { startAt: new Date(2026, 7, 31, 23, 59) }),
        visit('after', 'amel', 1000, { startAt: new Date(2026, 9, 1, 0, 0) }),
      ],
      sales: [
        purchase('first', 'amel', 20, new Date(2026, 8, 1, 0, 0)),
        purchase('last', 'amel', 30, new Date(2026, 8, 30, 23, 59)),
        purchase('previous', 'amel', 500, new Date(2026, 7, 31, 23, 59)),
        purchase('next', 'amel', 700, new Date(2026, 9, 1, 0, 0)),
      ],
    });
    expect(spending(data)[0]?.spendingCents).toBe(6000);
    // October: the 1000 € visit and the 700 € purchase of 1 October.
    expect(spending(data, OCTOBER)[0]?.spendingCents).toBe(170000);
  });

  it('a Sale sold during an Appointment follows the Appointment date, never its own', () => {
    // Product added on 30 September to a visit of 5 October, checked out that day.
    const data = sources({
      appointments: [visit('a', 'amel', 100, { startAt: new Date(2026, 9, 5, 10, 0) })],
      sales: [
        sale('linked', new Date(2026, 8, 30, 18, 0), [line('mask', 'Masque', 1, 30)], {
          clientId: 'amel',
          appointmentId: 'a',
        }),
      ],
    });
    expect(spending(data, SEPTEMBER)).toEqual([]);
    expect(spending(data, OCTOBER)[0]?.spendingCents).toBe(13000);
  });

  it('aggregates by client id and keeps three rows', () => {
    const data = sources({
      appointments: [visit('a', 'c1', 10), visit('b', 'c2', 20), visit('c', 'c3', 30), visit('d', 'c4', 40)],
      sales: [purchase('s1', 'c1', 15), purchase('s2', 'c1', 25)],
    });
    expect(spending(data)).toEqual([
      { clientId: 'c1', spendingCents: 5000, completedAppointmentCount: 1 },
      { clientId: 'c4', spendingCents: 4000, completedAppointmentCount: 1 },
      { clientId: 'c3', spendingCents: 3000, completedAppointmentCount: 1 },
    ]);
  });

  it('changes nothing else: activity, cash and product figures ignore the client rule', () => {
    const paidAt = new Date(2026, 8, 15, 15, 0);
    const insights = getBusinessInsights(
      sources({
        appointments: [visit('a', 'amel', 100, { payment: { paidAt, cardAmountCents: 10000, cashAmountCents: 0 } })],
        sales: [purchase('s', 'amel', 70)],
      }),
      SEPTEMBER,
    );
    expect(insights.cash.totalCents).toBe(17000);
    expect(insights.completedAppointmentCount).toBe(1);
    // The standalone purchase is not part of any appointment value.
    expect(insights.completedAppointmentValueCents).toBe(10000);
    expect(insights.averageAppointmentValueCents).toBe(10000);
    expect(insights.soldProductUnitCount).toBe(1);
    expect(insights.topServices).toEqual([{ serviceId: 's', serviceName: 'Soin', count: 1 }]);
    expect(insights.topProducts).toEqual([{ productId: 'product-s', productName: 'Huile', unitCount: 1 }]);
    expect(insights.topLoyalClients).toEqual([
      { clientId: 'amel', spendingCents: 17000, completedAppointmentCount: 1 },
    ]);
  });
});

describe('getBusinessInsights — conflicts, empty and future periods', () => {
  it('reports a financial conflict without counting its value, and keeps its money in the cash', () => {
    // Deposits (50 €) above what the open Appointment is now expected at (30 €).
    const conflicting = appointment('a', { status: 'SCHEDULED', items: [item('s', 'Soin', 30)] });
    const insights = getBusinessInsights(
      sources({ appointments: [conflicting], deposits: [deposit('d', 'a', { amountCents: 5000 })] }),
      SEPTEMBER,
    );
    expect(insights.financialConflictCount).toBe(1);
    expect(insights.completedAppointmentCount).toBe(0);
    expect(insights.completedAppointmentValueCents).toBe(0);
    expect(insights.cash.totalCents).toBe(5000);
  });

  it('an empty period is all zeros and no ranking', () => {
    const insights = getBusinessInsights(sources({}), SEPTEMBER);
    expect(insights).toMatchObject({
      cash: { totalCents: 0, checkoutCount: 0 },
      completedAppointmentCount: 0,
      averageAppointmentValueCents: 0,
      topServices: [],
      topProducts: [],
      financialConflictCount: 0,
      isEmpty: true,
    });
  });

  it('a future period with scheduled Appointments shows no activity', () => {
    const future = getInsightsPeriod('MONTH', new Date(2027, 2, 1));
    const insights = getBusinessInsights(
      sources({ appointments: [appointment('a', { status: 'SCHEDULED', startAt: new Date(2027, 2, 10) })] }),
      future,
    );
    expect(insights.completedAppointmentCount).toBe(0);
    expect(insights.topServices).toEqual([]);
    expect(insights.isEmpty).toBe(true);
  });
});
