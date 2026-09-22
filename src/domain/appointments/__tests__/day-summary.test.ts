import type { Sale } from '../../sales/types';
import { getAppointmentDaySummary } from '../day-summary';
import type { Appointment, AppointmentDeposit, AppointmentItem } from '../types';

const day = new Date(2026, 8, 21);

function item(id: string, price: number, phases: readonly (readonly [number, boolean])[]): AppointmentItem {
  return {
    id,
    serviceId: `service-${id}`,
    order: 0,
    serviceName: id,
    serviceType: 'TECHNIQUE',
    price,
    phases: phases.map(([durationMinutes, requiresStaff], index) => ({
      id: `${id}-phase-${index}`,
      name: `Phase ${index}`,
      durationMinutes,
      requiresStaff,
    })),
  };
}

function appointment(overrides: Partial<Appointment> & Pick<Appointment, 'id'>): Appointment {
  return {
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 21, 9, 0),
    status: 'SCHEDULED',
    items: [item('cut', 35, [[30, true]])],
    ...overrides,
  };
}

const noSales: readonly Sale[] = [];

describe('Appointment day summary', () => {
  it('is neutral on a day without Appointments', () => {
    expect(getAppointmentDaySummary({ appointments: [], sales: noSales }, day)).toEqual({
      appointmentCount: 0,
      rows: [],
      potentialRevenueCents: 0,
      collectedCents: 0,
      remainingToCollectCents: 0,
      totalDurationMinutes: 0,
      averageBasketCents: 0,
    });
  });

  it('counts only the Appointments that start on the local day, chronologically', () => {
    const late = appointment({ id: 'late', startAt: new Date(2026, 8, 21, 23, 50) });
    const early = appointment({ id: 'early', startAt: new Date(2026, 8, 21, 0, 0) });
    const dayBefore = appointment({ id: 'before', startAt: new Date(2026, 8, 20, 23, 59) });
    const dayAfter = appointment({ id: 'after', startAt: new Date(2026, 8, 22, 0, 0) });

    const summary = getAppointmentDaySummary(
      { appointments: [late, dayBefore, early, dayAfter], sales: noSales },
      new Date(2026, 8, 21, 15, 30),
    );

    expect(summary.rows.map((row) => row.appointment.id)).toEqual(['early', 'late']);
    expect(summary.appointmentCount).toBe(2);
  });

  it('leaves cancelled and no-show Appointments out, like the Agenda', () => {
    const summary = getAppointmentDaySummary(
      {
        appointments: [
          appointment({ id: 'kept' }),
          appointment({ id: 'cancelled', status: 'CANCELLED' }),
          appointment({ id: 'no-show', status: 'NO_SHOW' }),
        ],
        sales: noSales,
      },
      day,
    );

    expect(summary.rows.map((row) => row.appointment.id)).toEqual(['kept']);
    expect(summary.potentialRevenueCents).toBe(3500);
  });

  it('derives the potential revenue from snapshots, net of the discount, linked Sales included', () => {
    const discounted = appointment({
      id: 'discounted',
      items: [item('color', 80, [[20, true]]), item('cut', 35, [[30, true]])],
      discount: { type: 'PERCENT', percent: 20 },
    });
    const linkedSale: Sale = {
      id: 'sale-a',
      businessId: 'business-a',
      clientId: 'client-a',
      appointmentId: 'discounted',
      completedAt: new Date(2026, 8, 21, 10, 0),
      items: [{ id: 's0', productId: 'mask', productName: 'Mask', unitPrice: 20, quantity: 2 }],
    };
    const standaloneSale: Sale = { ...linkedSale, id: 'sale-b', appointmentId: undefined };

    const summary = getAppointmentDaySummary(
      { appointments: [discounted], sales: [linkedSale, standaloneSale] },
      day,
    );

    // 115,00 € − 20 % = 92,00 € of services, + 40,00 € sold during the Appointment.
    expect(summary.rows[0].expectedTotalCents).toBe(13200);
    expect(summary.potentialRevenueCents).toBe(13200);
  });

  it('splits what is collected from what remains through the recorded checkouts', () => {
    const paid = appointment({
      id: 'paid',
      status: 'COMPLETED',
      // The amount received may differ from the expected total (tip).
      payment: { paidAt: new Date(2026, 8, 21, 10, 0), cardAmountCents: 3000, cashAmountCents: 1000 },
    });
    const completedUnpaid = appointment({
      id: 'auto-completed',
      status: 'COMPLETED',
      startAt: new Date(2026, 8, 21, 11, 0),
    });
    const upcoming = appointment({ id: 'upcoming', startAt: new Date(2026, 8, 21, 14, 0) });

    const summary = getAppointmentDaySummary(
      { appointments: [paid, completedUnpaid, upcoming], sales: noSales },
      day,
    );

    expect(summary.potentialRevenueCents).toBe(10500);
    expect(summary.collectedCents).toBe(4000);
    // The checkout settles its Appointment; the two others are still expected.
    expect(summary.remainingToCollectCents).toBe(7000);
    expect(summary.rows.map((row) => row.collected)).toEqual([true, false, false]);
  });

  it('adds up booked time, processing included, even when Appointments overlap', () => {
    const technique = appointment({
      id: 'technique',
      items: [item('color', 80, [[15, true], [35, false], [20, true]])],
    });
    const overlapping = appointment({ id: 'overlapping', startAt: new Date(2026, 8, 21, 9, 20) });

    const summary = getAppointmentDaySummary(
      { appointments: [technique, overlapping], sales: noSales },
      day,
    );

    expect(summary.totalDurationMinutes).toBe(100);
  });

  it('averages the potential revenue per counted Appointment, rounded to the cent', () => {
    const summary = getAppointmentDaySummary(
      {
        appointments: [
          appointment({ id: 'a', items: [item('a', 10, [[10, true]])] }),
          appointment({ id: 'b', items: [item('b', 10, [[10, true]])] }),
          appointment({ id: 'c', items: [item('c', 10.01, [[10, true]])] }),
        ],
        sales: noSales,
      },
      day,
    );

    expect(summary.potentialRevenueCents).toBe(3001);
    expect(summary.averageBasketCents).toBe(1000);
  });

  describe('deposits — the day of the APPOINTMENT, whenever the money came in', () => {
    const hundred = () => appointment({ id: 'hundred', items: [item('color', 100, [[60, true]])] });
    // Paid on 5 September for an Appointment on 21 September.
    const earlyDeposit: AppointmentDeposit = {
      id: 'deposit-early',
      businessId: 'business-a',
      appointmentId: 'hundred',
      amountCents: 3000,
      paymentMethod: 'CARD',
      paidAt: new Date(2026, 8, 5, 11, 0),
      status: 'ACTIVE',
      createdAt: new Date(2026, 8, 5, 11, 0),
    };

    it('expected 100 €, 30 € paid earlier, no checkout: 100 / 30 / 70', () => {
      const summary = getAppointmentDaySummary(
        { appointments: [hundred()], sales: noSales, deposits: [earlyDeposit] },
        day,
      );
      expect(summary.potentialRevenueCents).toBe(10000);
      expect(summary.collectedCents).toBe(3000);
      expect(summary.remainingToCollectCents).toBe(7000);
      expect(summary.rows[0]).toMatchObject({ depositCents: 3000, collectedCents: 3000, remainingCents: 7000, collected: false });
    });

    it('after the final checkout of 70 €: 100 / 100 / 0', () => {
      const settled = {
        ...hundred(),
        status: 'COMPLETED' as const,
        payment: { paidAt: new Date(2026, 8, 21, 11, 0), cardAmountCents: 7000, cashAmountCents: 0 },
      };
      const summary = getAppointmentDaySummary(
        { appointments: [settled], sales: noSales, deposits: [earlyDeposit] },
        day,
      );
      expect(summary.potentialRevenueCents).toBe(10000);
      expect(summary.collectedCents).toBe(10000);
      expect(summary.remainingToCollectCents).toBe(0);
    });

    it('a final payment that differs from what was due keeps the recorded amounts and owes nothing', () => {
      const tipped = {
        ...hundred(),
        status: 'COMPLETED' as const,
        payment: { paidAt: new Date(2026, 8, 21, 11, 0), cardAmountCents: 6500, cashAmountCents: 1000 },
      };
      const summary = getAppointmentDaySummary(
        { appointments: [tipped], sales: noSales, deposits: [earlyDeposit] },
        day,
      );
      expect(summary.collectedCents).toBe(10500);
      expect(summary.remainingToCollectCents).toBe(0);
    });

    it('a fully prepaid Appointment completed without payment is settled', () => {
      const prepaid = { ...hundred(), status: 'COMPLETED' as const };
      const summary = getAppointmentDaySummary(
        { appointments: [prepaid], sales: noSales, deposits: [{ ...earlyDeposit, amountCents: 10000 }] },
        day,
      );
      expect(summary.collectedCents).toBe(10000);
      expect(summary.remainingToCollectCents).toBe(0);
      expect(summary.rows[0]?.collected).toBe(true);
    });

    it('a VOIDED deposit is neither collected nor deducted', () => {
      const voided: AppointmentDeposit = { ...earlyDeposit, status: 'VOIDED', voidedAt: new Date(2026, 8, 6) };
      const summary = getAppointmentDaySummary(
        { appointments: [hundred()], sales: noSales, deposits: [voided] },
        day,
      );
      expect(summary.collectedCents).toBe(0);
      expect(summary.remainingToCollectCents).toBe(10000);
    });
  });
});
