import { checkoutAppointment, type Appointment } from '../../appointments';
import type { Sale } from '../../sales';
import {
  EMPTY_CASH_REGISTER_SUMMARY,
  getCashRegisterDaySummary,
  getCashRegisterMonthSummary,
  getCashRegisterPayments,
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

function paid(id: string, paidAt: Date, cardAmountCents: number, cashAmountCents: number): Appointment {
  return checkoutAppointment(
    appointment(id, { startAt: new Date(paidAt.getTime() - 60 * 60 * 1000) }),
    { cardAmountCents, cashAmountCents },
    paidAt,
  );
}

function sale(id: string, overrides: Partial<Sale> = {}): Sale {
  return {
    id,
    businessId: 'business-a',
    completedAt: new Date(2026, 8, 12, 11, 0),
    items: [{ id: `${id}-0`, productId: 'p', productName: 'Shampoo', unitPrice: 20, quantity: 1 }],
    ...overrides,
  };
}

function standaloneSale(id: string, paidAt: Date, cardAmountCents: number, cashAmountCents: number): Sale {
  return sale(id, { completedAt: paidAt, payment: { paidAt, cardAmountCents, cashAmountCents } });
}

const noSales = { sales: [] as readonly Sale[] };

describe('Cash Register derivation', () => {
  it('sums card and cash with exact cents for one local day', () => {
    const appointments = [
      paid('a', new Date(2026, 8, 12, 10, 0), 7500, 0),
      paid('b', new Date(2026, 8, 12, 14, 30), 5000, 2500),
      paid('c', new Date(2026, 8, 12, 18, 0), 1, 2),
    ];

    expect(getCashRegisterDaySummary({ appointments, ...noSales }, new Date(2026, 8, 12, 23, 59))).toEqual({
      totalCents: 15003,
      cardCents: 12501,
      cashCents: 2502,
      checkoutCount: 3,
    });
  });

  it('counts standalone Sale payments next to Appointment checkouts on a mixed day', () => {
    const day = new Date(2026, 8, 12, 12, 0);
    const sources = {
      appointments: [paid('a', day, 9500, 0)],
      sales: [
        standaloneSale('s1', new Date(2026, 8, 12, 16, 0), 0, 2000),
        standaloneSale('s2', new Date(2026, 8, 12, 17, 0), 1250, 750),
      ],
    };

    expect(getCashRegisterDaySummary(sources, day)).toEqual({
      totalCents: 13500,
      cardCents: 10750,
      cashCents: 2750,
      checkoutCount: 3,
    });
  });

  it('never counts an Appointment-linked Sale separately from its Appointment checkout', () => {
    const day = new Date(2026, 8, 12, 12, 0);
    const sources = {
      // services 75 € + linked products 20 € → the professional recorded 95 €
      appointments: [paid('a', day, 9500, 0)],
      sales: [
        sale('linked', { appointmentId: 'a', completedAt: day }),
        // Defensive: even a linked Sale that somehow carries a payment is ignored.
        sale('linked-paid', { appointmentId: 'a', completedAt: day, payment: { paidAt: day, cardAmountCents: 2000, cashAmountCents: 0 } }),
      ],
    };

    expect(getCashRegisterDaySummary(sources, day)).toEqual({
      totalCents: 9500,
      cardCents: 9500,
      cashCents: 0,
      checkoutCount: 1,
    });
    expect(getCashRegisterPayments(sources)).toHaveLength(1);
  });

  it('ignores standalone Sales without a recorded payment', () => {
    const day = new Date(2026, 8, 12, 12, 0);
    expect(
      getCashRegisterDaySummary({ appointments: [], sales: [sale('historical', { completedAt: day })] }, day),
    ).toEqual(EMPTY_CASH_REGISTER_SUMMARY);
  });

  it('groups by the LOCAL civil day around midnight, never by a UTC substring', () => {
    const lateEvening = paid('late', new Date(2026, 8, 12, 23, 45), 1000, 0);
    const justAfterMidnight = standaloneSale('early', new Date(2026, 8, 13, 0, 15), 0, 2000);
    const sources = { appointments: [lateEvening], sales: [justAfterMidnight] };

    expect(getCashRegisterDaySummary(sources, new Date(2026, 8, 12))).toMatchObject({
      totalCents: 1000,
      checkoutCount: 1,
    });
    expect(getCashRegisterDaySummary(sources, new Date(2026, 8, 13))).toMatchObject({
      totalCents: 2000,
      checkoutCount: 1,
    });
    expect(getCashRegisterDaySummary(sources, new Date(2026, 8, 11))).toEqual(
      EMPTY_CASH_REGISTER_SUMMARY,
    );
    // Whatever the device time zone, the local calendar fields decide.
    expect(lateEvening.payment?.paidAt.getDate()).toBe(12);
    expect(justAfterMidnight.payment?.paidAt.getDate()).toBe(13);
  });

  it('excludes completed appointments without payment, cancellations and no-shows', () => {
    const day = new Date(2026, 8, 12, 12, 0);
    const appointments = [
      appointment('auto-completed', { status: 'COMPLETED' }),
      appointment('cancelled', {
        status: 'CANCELLED',
        cancellation: { cancelledAt: day, cancelledBy: 'CLIENT' },
      }),
      appointment('no-show', { status: 'NO_SHOW', noShow: { recordedAt: day } }),
      appointment('scheduled'),
      paid('paid', day, 4200, 0),
    ];

    expect(getCashRegisterDaySummary({ appointments, ...noSales }, day)).toEqual({
      totalCents: 4200,
      cardCents: 4200,
      cashCents: 0,
      checkoutCount: 1,
    });
  });

  it('returns zero values for an empty day', () => {
    expect(getCashRegisterDaySummary({ appointments: [], sales: [] }, new Date(2026, 8, 12))).toEqual(
      EMPTY_CASH_REGISTER_SUMMARY,
    );
    expect(
      getCashRegisterDaySummary({ appointments: [appointment('scheduled')], ...noSales }, new Date(2026, 8, 12)),
    ).toEqual(EMPTY_CASH_REGISTER_SUMMARY);
  });

  it('sums the actual calendar month from both sources, previous and next, not a rolling window', () => {
    const sources = {
      appointments: [
        paid('aug-31', new Date(2026, 7, 31, 23, 50), 1000, 0),
        paid('sep-01', new Date(2026, 8, 1, 0, 10), 2000, 0),
        paid('sep-30', new Date(2026, 8, 30, 23, 59), 4000, 0),
        paid('oct-01', new Date(2026, 9, 1, 0, 0), 0, 5000),
      ],
      sales: [
        standaloneSale('sep-15', new Date(2026, 8, 15, 12, 0), 0, 3000),
        sale('sep-linked', { appointmentId: 'sep-01', completedAt: new Date(2026, 8, 1, 0, 5) }),
      ],
    };

    expect(getCashRegisterMonthSummary(sources, new Date(2026, 8, 20))).toEqual({
      totalCents: 9000,
      cardCents: 6000,
      cashCents: 3000,
      checkoutCount: 3,
    });
    expect(getCashRegisterMonthSummary(sources, new Date(2026, 7, 1))).toMatchObject({
      totalCents: 1000,
      checkoutCount: 1,
    });
    expect(getCashRegisterMonthSummary(sources, new Date(2026, 9, 31))).toMatchObject({
      totalCents: 5000,
      checkoutCount: 1,
    });
    expect(getCashRegisterMonthSummary(sources, new Date(2027, 8, 1))).toEqual(
      EMPTY_CASH_REGISTER_SUMMARY,
    );
  });

  it('uses each payment instant, not the appointment start or sale completion, for grouping', () => {
    const startedYesterdayPaidToday = checkoutAppointment(
      appointment('late-checkout', { startAt: new Date(2026, 8, 11, 18, 0) }),
      { cardAmountCents: 9000, cashAmountCents: 0 },
      new Date(2026, 8, 12, 9, 0),
    );
    const sources = { appointments: [startedYesterdayPaidToday], sales: [] };

    expect(getCashRegisterDaySummary(sources, new Date(2026, 8, 11)).checkoutCount).toBe(0);
    expect(getCashRegisterDaySummary(sources, new Date(2026, 8, 12)).totalCents).toBe(9000);
  });
});
