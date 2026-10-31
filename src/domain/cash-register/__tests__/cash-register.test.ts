import {
  checkoutAppointment,
  getAppointmentExpectedTotal,
  getAppointmentRemainingAmount,
  type Appointment,
  type AppointmentDeposit,
  type AppointmentItem,
} from '../../appointments';
import type { Sale } from '../../sales';
import {
  EMPTY_CASH_REGISTER_SUMMARY,
  countCashRegisterPayingClients,
  getCashRegisterDailyTotals,
  getCashRegisterDayKey,
  getCashRegisterDayEntries,
  getCashRegisterDaySummary,
  getCashRegisterEntryClientId,
  getCashRegisterIntervalSummary,
  getCashRegisterMonthEntries,
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

  describe('Appointment discount', () => {
    const day = new Date(2026, 8, 12, 10, 0);
    const services = (price: number): AppointmentItem[] => [
      { id: 'i0', serviceId: 'color', order: 0, serviceName: 'Coloration', serviceType: 'TECHNIQUE', price, phases: [] },
    ];
    /** Encaisser for exactly the expected total — what the checkout sheet prefills. */
    const checkoutExpected = (booked: Appointment): Appointment =>
      checkoutAppointment(
        booked,
        { cardAmountCents: getAppointmentExpectedTotal(booked, []).expectedTotalCents, cashAmountCents: 0 },
        day,
      );

    it('a completed discounted Appointment contributes its FINAL discounted value', () => {
      const discounted = checkoutExpected(
        appointment('discounted', { items: services(100), discount: { type: 'PERCENT', percent: 20 } }),
      );

      expect(getCashRegisterDaySummary({ appointments: [discounted], ...noSales }, day)).toEqual({
        totalCents: 8000,
        cardCents: 8000,
        cashCents: 0,
        checkoutCount: 1,
      });
    });

    it('an undiscounted Appointment contributes exactly its unchanged value', () => {
      const plain = checkoutExpected(appointment('plain', { items: services(100) }));
      const fixed = checkoutExpected(
        appointment('fixed', { items: services(100), discount: { type: 'FIXED', amountCents: 1500 } }),
      );

      expect(getCashRegisterDaySummary({ appointments: [plain], ...noSales }, day).totalCents).toBe(10000);
      expect(getCashRegisterDaySummary({ appointments: [plain, fixed], ...noSales }, day).totalCents).toBe(18500);
    });
  });

  describe('entries of a period', () => {
    it('lists exactly what the summary counts, with its source, oldest payment first', () => {
      const day = new Date(2026, 8, 12, 12, 0);
      const sources = {
        appointments: [paid('late', new Date(2026, 8, 12, 17, 0), 9500, 0), paid('other-day', new Date(2026, 8, 13, 9, 0), 1000, 0)],
        sales: [
          standaloneSale('morning', new Date(2026, 8, 12, 9, 30), 1250, 750),
          sale('linked-paid', { appointmentId: 'late', completedAt: day, payment: { paidAt: day, cardAmountCents: 2000, cashAmountCents: 0 } }),
          sale('unpaid', { completedAt: day }),
        ],
      };

      const entries = getCashRegisterDayEntries(sources, day);

      expect(entries.map((entry) => (entry.kind === 'SALE' ? entry.sale.id : entry.kind === 'SALE_ADJUSTMENT' ? entry.adjustment.id : entry.appointment?.id))).toEqual([
        'morning',
        'late',
      ]);
      expect(entries.map((entry) => entry.kind)).toEqual(['SALE', 'APPOINTMENT']);
      expect(entries).toHaveLength(getCashRegisterDaySummary(sources, day).checkoutCount);
      expect(entries.reduce((sum, { payment }) => sum + payment.cardAmountCents + payment.cashAmountCents, 0)).toBe(
        getCashRegisterDaySummary(sources, day).totalCents,
      );
    });

    it('lists the local calendar month and nothing outside it', () => {
      const sources = {
        appointments: [paid('first', new Date(2026, 8, 1, 0, 5), 1000, 0), paid('previous', new Date(2026, 7, 31, 23, 55), 500, 0)],
        ...noSales,
      };

      expect(getCashRegisterMonthEntries(sources, new Date(2026, 8, 20)).map((entry) => entry.payment.cardAmountCents)).toEqual([1000]);
      expect(getCashRegisterMonthEntries(sources, new Date(2026, 9, 1))).toEqual([]);
    });
  });

  describe('deposits — counted on the day the money was RECEIVED', () => {
    const appointmentDay = new Date(2026, 9, 5, 10, 0); // 5 October
    const depositDay = new Date(2026, 8, 22, 11, 0); // 22 September
    const service: AppointmentItem = {
      id: 'color',
      serviceId: 'service-color',
      order: 0,
      serviceName: 'Couleur',
      serviceType: 'TECHNIQUE',
      price: 100,
      phases: [{ id: 'p', name: 'Application', durationMinutes: 60, requiresStaff: true }],
    };
    const booked = appointment('october', { startAt: appointmentDay, items: [service] });
    const deposit = (overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit => ({
      id: 'deposit-card',
      businessId: 'business-a',
      appointmentId: 'october',
      amountCents: 3000,
      paymentMethod: 'CARD',
      paidAt: depositDay,
      status: 'ACTIVE',
      createdAt: depositDay,
      ...overrides,
    });

    it('22 September counts the deposit; 5 October does not count it again', () => {
      const sources = { appointments: [booked], ...noSales, deposits: [deposit()] };
      expect(getCashRegisterDaySummary(sources, depositDay)).toEqual({
        totalCents: 3000,
        cardCents: 3000,
        cashCents: 0,
        checkoutCount: 1,
      });
      expect(getCashRegisterDaySummary(sources, appointmentDay)).toEqual(EMPTY_CASH_REGISTER_SUMMARY);
      const [entry] = getCashRegisterDayEntries(sources, depositDay);
      expect(entry?.kind).toBe('DEPOSIT');
      expect(entry?.kind === 'DEPOSIT' ? entry.appointment?.id : undefined).toBe('october');
    });

    it('after the final checkout, 5 October holds ONLY the final payment — nothing is counted twice', () => {
      const due = getAppointmentRemainingAmount(booked, [], [deposit()]);
      expect(due).toBe(7000);
      const settled = checkoutAppointment(booked, { cardAmountCents: due, cashAmountCents: 0 }, new Date(2026, 9, 5, 11, 0));
      const sources = { appointments: [settled], ...noSales, deposits: [deposit()] };
      expect(getCashRegisterDaySummary(sources, appointmentDay).totalCents).toBe(7000);
      expect(getCashRegisterDaySummary(sources, depositDay).totalCents).toBe(3000);
      // The month holds both, once each: 30 + 70 = the 100 € Appointment.
      expect(getCashRegisterMonthSummary(sources, depositDay).totalCents).toBe(3000);
      expect(getCashRegisterMonthSummary(sources, appointmentDay).totalCents).toBe(7000);
    });

    it('splits deposits by their own method and adds several of them', () => {
      const sources = {
        appointments: [booked],
        ...noSales,
        deposits: [
          deposit(),
          deposit({ id: 'deposit-cash', amountCents: 2000, paymentMethod: 'CASH', paidAt: new Date(2026, 8, 22, 16, 0) }),
        ],
      };
      expect(getCashRegisterDaySummary(sources, depositDay)).toEqual({
        totalCents: 5000,
        cardCents: 3000,
        cashCents: 2000,
        checkoutCount: 2,
      });
      expect(getCashRegisterDayEntries(sources, depositDay).map((entry) => entry.kind)).toEqual(['DEPOSIT', 'DEPOSIT']);
    });

    it('excludes VOIDED deposits from totals and entries', () => {
      const sources = {
        appointments: [booked],
        ...noSales,
        deposits: [deposit({ status: 'VOIDED', voidedAt: new Date(2026, 8, 23) })],
      };
      expect(getCashRegisterDaySummary(sources, depositDay)).toEqual(EMPTY_CASH_REGISTER_SUMMARY);
      expect(getCashRegisterDayEntries(sources, depositDay)).toEqual([]);
      expect(getCashRegisterPayments(sources)).toEqual([]);
    });

    it('aggregates deposits of several days in their month', () => {
      const sources = {
        appointments: [booked],
        ...noSales,
        deposits: [
          deposit({ id: 'd1', paidAt: new Date(2026, 8, 2, 9, 0) }),
          deposit({ id: 'd2', paidAt: new Date(2026, 8, 30, 18, 0), amountCents: 2000, paymentMethod: 'CASH' }),
          deposit({ id: 'd3', paidAt: new Date(2026, 9, 1, 9, 0), amountCents: 1000 }),
        ],
      };
      expect(getCashRegisterMonthSummary(sources, new Date(2026, 8, 15))).toEqual({
        totalCents: 5000,
        cardCents: 3000,
        cashCents: 2000,
        checkoutCount: 2,
      });
      expect(getCashRegisterMonthEntries(sources, new Date(2026, 8, 15)).map((entry) => entry.payment.paidAt.getDate())).toEqual([2, 30]);
    });
  });
});

describe('Cash Register — any local span', () => {
  it('counts exactly the payments with start <= paidAt < end, like the day and month summaries', () => {
    const appointments = [
      paid('before', new Date(2026, 8, 20, 23, 59), 1000, 0),
      paid('monday', new Date(2026, 8, 21, 0, 0), 2000, 0),
      paid('sunday', new Date(2026, 8, 27, 23, 59), 0, 500),
      paid('after', new Date(2026, 8, 28, 0, 0), 4000, 0),
    ];
    const week = { start: new Date(2026, 8, 21), end: new Date(2026, 8, 28) };
    expect(getCashRegisterIntervalSummary({ appointments, ...noSales }, week)).toEqual({
      totalCents: 2500,
      cardCents: 2000,
      cashCents: 500,
      checkoutCount: 2,
    });
    const month = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };
    expect(getCashRegisterIntervalSummary({ appointments, ...noSales }, month)).toEqual(
      getCashRegisterMonthSummary({ appointments, ...noSales }, new Date(2026, 8, 15)),
    );
  });
});

describe('Cash Register — daily totals', () => {
  const deposit = (id: string, paidAt: Date, status: AppointmentDeposit['status'] = 'ACTIVE'): AppointmentDeposit => ({
    id,
    businessId: 'business-a',
    appointmentId: 'booked',
    amountCents: 3000,
    paymentMethod: 'CASH',
    paidAt,
    status,
    createdAt: paidAt,
  });
  const sources = {
    appointments: [
      paid('checkout', new Date(2026, 8, 3, 10, 0), 9500, 0),
      // Paid late in the local evening: the 3rd, whatever the UTC date.
      paid('late', new Date(2026, 8, 3, 23, 59), 1, 2),
      appointment('unpaid', { status: 'COMPLETED', startAt: new Date(2026, 8, 4, 9, 0) }),
      appointment('booked', { startAt: new Date(2026, 9, 5, 10, 0) }),
    ],
    sales: [
      standaloneSale('standalone', new Date(2026, 8, 4, 0, 0), 1250, 750),
      sale('linked', {
        appointmentId: 'checkout',
        payment: { paidAt: new Date(2026, 8, 4, 12, 0), cardAmountCents: 4000, cashAmountCents: 0 },
      }),
      sale('unpaid-sale', { completedAt: new Date(2026, 8, 5, 12, 0) }),
    ],
    deposits: [deposit('active', new Date(2026, 8, 22, 11, 0)), deposit('voided', new Date(2026, 8, 23, 11, 0), 'VOIDED')],
  };

  it('keys a day by its local civil date, zero-padded', () => {
    expect(getCashRegisterDayKey(new Date(2026, 8, 3, 23, 59))).toBe('2026-09-03');
    expect(getCashRegisterDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('groups checkouts, standalone Sales and ACTIVE deposits on the local day they were received', () => {
    expect(Object.fromEntries(getCashRegisterDailyTotals(sources))).toEqual({
      '2026-09-03': 9503,
      '2026-09-04': 2000,
      // The deposit counts on its payment day, never on the 5 October Appointment day.
      '2026-09-22': 3000,
    });
  });

  it('agrees with the day summary on every day, counted or not', () => {
    const totals = getCashRegisterDailyTotals(sources);
    for (let date = 1; date <= 30; date += 1) {
      const day = new Date(2026, 8, date, 12, 0);
      expect(totals.get(getCashRegisterDayKey(day)) ?? 0).toBe(getCashRegisterDaySummary(sources, day).totalCents);
    }
    expect(totals.has('2026-10-05')).toBe(false);
  });
});

describe('Cash Register — distinct paying clients', () => {
  const day = new Date(2026, 8, 12, 12, 0);
  const service: AppointmentItem = {
    id: 'cut',
    serviceId: 'service-cut',
    order: 0,
    serviceName: 'Coupe',
    serviceType: 'SERVICE',
    price: 40,
    phases: [{ id: 'p', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
  };
  const deposit = (id: string, appointmentId: string, paidAt: Date, overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit => ({
    id,
    businessId: 'business-a',
    appointmentId,
    amountCents: 2000,
    paymentMethod: 'CASH',
    paidAt,
    status: 'ACTIVE',
    createdAt: paidAt,
    ...overrides,
  });

  it('names the client behind each entry kind by stable id — never a name or a phone', () => {
    const paidAppointment = paid('a', day, 4000, 0);
    const scheduled = appointment('b', { clientId: 'client-b', items: [service], startAt: new Date(2026, 9, 1, 10, 0) });
    const sources = {
      appointments: [paidAppointment, scheduled],
      sales: [standaloneSale('s', day, 1000, 0), standaloneSale('walk-in', day, 500, 0)].map((sale, index) =>
        index === 0 ? { ...sale, clientId: 'client-s' } : sale,
      ),
      deposits: [deposit('d', 'b', day), deposit('orphan', 'not-loaded', day)],
    };

    const entries = getCashRegisterDayEntries(sources, day);
    const clientOf = (id: string) => getCashRegisterEntryClientId(entries.find((entry) => (entry.kind === 'SALE' ? entry.sale.id : entry.kind === 'DEPOSIT' ? entry.deposit.id : entry.kind === 'SALE_ADJUSTMENT' ? entry.adjustment.id : entry.appointment.id) === id)!);

    expect(clientOf('a')).toBe('client-a');
    expect(clientOf('s')).toBe('client-s');
    expect(clientOf('walk-in')).toBeUndefined();
    expect(clientOf('d')).toBe('client-b');
    // The money of a deposit whose Appointment is not loaded is counted, but identifies nobody.
    expect(clientOf('orphan')).toBeUndefined();
  });

  it('counts a client once however many times they paid: checkout, deposit and standalone Sale', () => {
    const sources = {
      appointments: [paid('cut', new Date(2026, 8, 12, 10, 0), 4000, 0), appointment('later', { items: [service], startAt: new Date(2026, 9, 1, 10, 0) })],
      sales: [{ ...standaloneSale('shampoo', new Date(2026, 8, 12, 10, 20), 2000, 0), clientId: 'client-a' }],
      deposits: [deposit('advance', 'later', new Date(2026, 8, 12, 16, 0))],
    };
    const entries = getCashRegisterDayEntries(sources, day);

    expect(entries).toHaveLength(3);
    expect(getCashRegisterDaySummary(sources, day).checkoutCount).toBe(3);
    expect(countCashRegisterPayingClients(entries)).toBe(1);
  });

  it('counts each distinct client, across Appointment and product payments', () => {
    const sources = {
      appointments: [
        paid('a', new Date(2026, 8, 12, 9, 0), 4000, 0),
        { ...paid('b', new Date(2026, 8, 12, 11, 0), 6000, 0), clientId: 'client-b' },
      ],
      sales: [
        { ...standaloneSale('s1', new Date(2026, 8, 12, 12, 0), 1500, 0), clientId: 'client-c' },
        { ...standaloneSale('s2', new Date(2026, 8, 12, 13, 0), 1500, 0), clientId: 'client-b' },
      ],
    };

    expect(countCashRegisterPayingClients(getCashRegisterDayEntries(sources, day))).toBe(3);
    expect(getCashRegisterDaySummary(sources, day).checkoutCount).toBe(4);
  });

  it('never counts anonymous payments as clients, and counts zero for an empty period', () => {
    const sources = {
      appointments: [],
      sales: [standaloneSale('walk-in-1', day, 500, 0), standaloneSale('walk-in-2', day, 700, 300)],
    };

    expect(getCashRegisterDaySummary(sources, day).checkoutCount).toBe(2);
    expect(countCashRegisterPayingClients(getCashRegisterDayEntries(sources, day))).toBe(0);
    expect(countCashRegisterPayingClients([])).toBe(0);
  });

  it('follows the period: a client paid on another day counts in the month, not the day', () => {
    const sources = {
      appointments: [
        paid('today', new Date(2026, 8, 12, 10, 0), 4000, 0),
        { ...paid('earlier-this-month', new Date(2026, 8, 3, 10, 0), 4000, 0), clientId: 'client-b' },
        { ...paid('last-month', new Date(2026, 7, 30, 10, 0), 4000, 0), clientId: 'client-c' },
      ],
      ...noSales,
    };

    expect(countCashRegisterPayingClients(getCashRegisterDayEntries(sources, day))).toBe(1);
    expect(countCashRegisterPayingClients(getCashRegisterMonthEntries(sources, day))).toBe(2);
  });

  it('ignores what the totals ignore: VOIDED deposits, unpaid Sales, Sales sold during an Appointment, cancellations', () => {
    const sources = {
      appointments: [
        paid('paid', day, 4000, 0),
        appointment('cancelled', {
          clientId: 'client-cancelled',
          status: 'CANCELLED',
          cancellation: { cancelledAt: day, cancelledBy: 'CLIENT' },
        }),
        appointment('pending', { clientId: 'client-pending', items: [service], startAt: new Date(2026, 9, 1, 10, 0) }),
      ],
      sales: [
        { ...sale('linked', { appointmentId: 'paid', completedAt: day, payment: { paidAt: day, cardAmountCents: 2000, cashAmountCents: 0 } }), clientId: 'client-linked' },
        { ...sale('unpaid', { completedAt: day }), clientId: 'client-unpaid' },
      ],
      deposits: [deposit('voided', 'pending', day, { status: 'VOIDED', voidedAt: day })],
    };
    const entries = getCashRegisterDayEntries(sources, day);

    expect(entries).toHaveLength(1);
    expect(countCashRegisterPayingClients(entries)).toBe(1);
    // The summary itself is untouched by the client count.
    expect(getCashRegisterDaySummary(sources, day)).toEqual({ totalCents: 4000, cardCents: 4000, cashCents: 0, checkoutCount: 1 });
  });
});
