import type { Sale } from '../../sales/types';
import {
  getAppointmentDaySummary,
  getAppointmentPeriodActivity,
  getAppointmentPeriodSummary,
  type AppointmentDaySummary,
} from '../day-summary';
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

describe('Appointment period summary — the same rules over a range of days', () => {
  // Monday 21 → Sunday 27 September 2026.
  const week = { firstDay: new Date(2026, 8, 21), lastDay: new Date(2026, 8, 27) };
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(2026, 8, 21 + index));

  const deposit = (overrides: Partial<AppointmentDeposit> & Pick<AppointmentDeposit, 'id' | 'appointmentId'>): AppointmentDeposit => ({
    businessId: 'business-a',
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt: new Date(2026, 8, 10, 11, 0),
    status: 'ACTIVE',
    createdAt: new Date(2026, 8, 10, 11, 0),
    ...overrides,
  });

  // A realistic current week (today = Wednesday 23): past days settled or not,
  // today mixed, the rest still to come; plus the records the figures leave out.
  const appointments: readonly Appointment[] = [
    appointment({
      id: 'monday-paid',
      startAt: new Date(2026, 8, 21, 9, 0),
      status: 'COMPLETED',
      payment: { paidAt: new Date(2026, 8, 21, 9, 45), cardAmountCents: 3500, cashAmountCents: 0 },
    }),
    appointment({
      id: 'monday-discounted-paid',
      startAt: new Date(2026, 8, 21, 14, 0),
      status: 'COMPLETED',
      items: [item('color', 80, [[15, true], [35, false], [20, true]])],
      discount: { type: 'PERCENT', percent: 10 },
      payment: { paidAt: new Date(2026, 8, 21, 15, 20), cardAmountCents: 0, cashAmountCents: 7200 },
    }),
    appointment({ id: 'tuesday-no-show', startAt: new Date(2026, 8, 22, 10, 0), status: 'NO_SHOW' }),
    appointment({
      id: 'tuesday-completed-unpaid',
      startAt: new Date(2026, 8, 22, 11, 0),
      status: 'COMPLETED',
    }),
    appointment({
      id: 'wednesday-deposit',
      startAt: new Date(2026, 8, 23, 16, 0),
      items: [item('color', 100, [[60, true]])],
    }),
    appointment({
      id: 'thursday-cancelled',
      startAt: new Date(2026, 8, 24, 9, 0),
      status: 'CANCELLED',
      cancellation: { cancelledAt: new Date(2026, 8, 20), cancelledBy: 'CLIENT' },
    }),
    appointment({ id: 'friday-confirmed', startAt: new Date(2026, 8, 25, 9, 0), status: 'CONFIRMED' }),
    appointment({ id: 'sunday-late', startAt: new Date(2026, 8, 27, 23, 59) }),
    // Outside the week, on both sides.
    appointment({ id: 'sunday-before', startAt: new Date(2026, 8, 20, 23, 59) }),
    appointment({ id: 'monday-after', startAt: new Date(2026, 8, 28, 0, 0) }),
  ];
  const deposits: readonly AppointmentDeposit[] = [
    deposit({ id: 'deposit-wednesday', appointmentId: 'wednesday-deposit' }),
    // Counted nowhere: the Appointment was cancelled.
    deposit({ id: 'deposit-cancelled', appointmentId: 'thursday-cancelled', amountCents: 2000 }),
    deposit({ id: 'deposit-voided', appointmentId: 'friday-confirmed', status: 'VOIDED', voidedAt: new Date(2026, 8, 11) }),
  ];
  const sources = { appointments, sales: noSales, deposits };

  it('keeps the day summary exactly as it was: a day is the period of one day', () => {
    for (const day of [...weekDays, new Date(2026, 8, 20), new Date(2026, 8, 28)]) {
      expect(getAppointmentDaySummary(sources, day)).toEqual(
        getAppointmentPeriodSummary(sources, { firstDay: day, lastDay: day }),
      );
    }
  });

  it('counts the Appointments of the seven local days, first and last day included', () => {
    const summary = getAppointmentPeriodSummary(sources, week);

    expect(summary.rows.map((row) => row.appointment.id)).toEqual([
      'monday-paid',
      'monday-discounted-paid',
      'tuesday-completed-unpaid',
      'wednesday-deposit',
      'friday-confirmed',
      'sunday-late',
    ]);
    expect(summary.appointmentCount).toBe(6);
  });

  it('only reads the civil date of its bounds', () => {
    expect(
      getAppointmentPeriodSummary(sources, {
        firstDay: new Date(2026, 8, 21, 18, 30),
        lastDay: new Date(2026, 8, 27, 0, 0),
      }),
    ).toEqual(getAppointmentPeriodSummary(sources, week));
  });

  it('agrees with the seven day summaries, figure by figure', () => {
    const days: readonly AppointmentDaySummary[] = weekDays.map((day) => getAppointmentDaySummary(sources, day));
    const sum = (pick: (summary: AppointmentDaySummary) => number) =>
      days.reduce((total, summary) => total + pick(summary), 0);
    const summary = getAppointmentPeriodSummary(sources, week);

    expect(summary.appointmentCount).toBe(sum((day) => day.appointmentCount));
    expect(summary.potentialRevenueCents).toBe(sum((day) => day.potentialRevenueCents));
    expect(summary.collectedCents).toBe(sum((day) => day.collectedCents));
    expect(summary.remainingToCollectCents).toBe(sum((day) => day.remainingToCollectCents));
    expect(summary.totalDurationMinutes).toBe(sum((day) => day.totalDurationMinutes));
    expect(summary.rows).toEqual(days.flatMap((day) => day.rows));
  });

  it('adds up the week net of discounts, deposits included, future Appointments still owed', () => {
    const summary = getAppointmentPeriodSummary(sources, week);

    // 35 + 72 (80 − 10 %) + 35 + 100 + 35 + 35
    expect(summary.potentialRevenueCents).toBe(31200);
    // Two checkouts (35 + 72) and the 30 € deposit paid on 10 September.
    expect(summary.collectedCents).toBe(13700);
    // 35 (completed, no checkout) + 70 (100 − deposit) + 35 + 35
    expect(summary.remainingToCollectCents).toBe(17500);
    expect(summary.averageBasketCents).toBe(5200);
  });

  it('counts the outcomes of the week by stored status', () => {
    expect(getAppointmentPeriodActivity(appointments, week)).toEqual({
      completedCount: 3,
      plannedCount: 3,
      cancelledCount: 1,
      noShowCount: 1,
    });
  });

  it('completed and planned always add up to the counted Appointments', () => {
    const activity = getAppointmentPeriodActivity(appointments, week);
    expect(activity.completedCount + activity.plannedCount).toBe(
      getAppointmentPeriodSummary(sources, week).appointmentCount,
    );
  });

  it('follows an Appointment moved to another week', () => {
    const moved = appointments.map((entry) =>
      entry.id === 'friday-confirmed' ? { ...entry, startAt: new Date(2026, 8, 29, 9, 0) } : entry,
    );
    const summary = getAppointmentPeriodSummary({ ...sources, appointments: moved }, week);

    expect(summary.rows.map((row) => row.appointment.id)).not.toContain('friday-confirmed');
    expect(summary.potentialRevenueCents).toBe(27700);
    expect(getAppointmentPeriodActivity(moved, week).plannedCount).toBe(2);
  });

  it('is neutral on an empty week', () => {
    const empty = { firstDay: new Date(2026, 10, 2), lastDay: new Date(2026, 10, 8) };
    expect(getAppointmentPeriodSummary(sources, empty)).toEqual(getAppointmentDaySummary({ appointments: [], sales: noSales }, day));
    expect(getAppointmentPeriodActivity(appointments, empty)).toEqual({
      completedCount: 0,
      plannedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
    });
  });

  it('crosses a year like any other week', () => {
    const newYear = { firstDay: new Date(2026, 11, 28), lastDay: new Date(2027, 0, 3) };
    const summary = getAppointmentPeriodSummary(
      {
        appointments: [
          appointment({ id: 'december', startAt: new Date(2026, 11, 31, 18, 0) }),
          appointment({ id: 'january', startAt: new Date(2027, 0, 3, 10, 0) }),
          appointment({ id: 'after', startAt: new Date(2027, 0, 4, 10, 0) }),
        ],
        sales: noSales,
      },
      newYear,
    );
    expect(summary.rows.map((row) => row.appointment.id)).toEqual(['december', 'january']);
  });
});
