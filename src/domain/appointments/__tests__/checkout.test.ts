import {
  canChangeAppointmentCheckoutDiscount,
  canSettleCompletedAppointmentWithDeposits,
  getAppointmentDepositPosition,
  isAppointmentSettled,
  canChooseAppointmentPaymentDate,
  findAppointmentCheckoutDiscountShortfall,
  getAppointmentCheckoutDueCents,
  getAppointmentDayPaymentInstant,
  getAppointmentPaymentInstant,
  getCheckoutPaymentBounds,
  getDepositPositionFromTotals,
  getPaymentCorrectionBounds,
  setAppointmentCheckoutDiscount,
  setAppointmentDiscount,
  validateAppointmentCheckoutAmounts,
  validateAppointmentPaymentCorrection,
  validateCheckoutAmounts,
  type Appointment,
  type AppointmentDeposit,
} from '..';
import { getCashRegisterDayKey, getCashRegisterDaySummary } from '../../cash-register';
import type { Sale } from '../../sales';
import { checkoutAppointment } from '../payment';

function appointment(overrides: Partial<Appointment> = {}, prices: readonly number[] = [100]): Appointment {
  return {
    id: 'appointment-a',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 6, 20, 14, 0),
    status: 'SCHEDULED',
    items: prices.map((price, index) => ({
      id: `item-${index}`,
      serviceId: `service-${index}`,
      order: index,
      serviceName: `Prestation ${index}`,
      serviceType: 'SERVICE' as const,
      price,
      phases: [{ id: `phase-${index}`, name: 'Prestation', durationMinutes: 45, requiresStaff: true }],
    })),
    ...overrides,
  };
}

function deposit(amountCents: number, overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit {
  return {
    id: `deposit-${amountCents}`,
    businessId: 'business-a',
    appointmentId: 'appointment-a',
    amountCents,
    paymentMethod: 'CARD',
    paidAt: new Date(2026, 6, 1, 10, 0),
    status: 'ACTIVE',
    createdAt: new Date(2026, 6, 1, 10, 0),
    ...overrides,
  };
}

const split = (cardAmountCents: number, cashAmountCents = 0) => ({ cardAmountCents, cashAmountCents });

describe('checkout due — expected total minus ACTIVE deposits', () => {
  it('no deposit: the whole expected total', () => {
    expect(getAppointmentCheckoutDueCents(appointment(), [], [])).toBe(10000);
  });

  it('services 120 €, a 10 € discount and a 20 € deposit: 90 €', () => {
    const discounted = appointment({ discount: { type: 'FIXED', amountCents: 1000 } }, [70, 50]);

    expect(getAppointmentCheckoutDueCents(discounted, [], [deposit(2000)])).toBe(9000);
  });

  it('uses the real PERCENT discount rounding and the linked Products', () => {
    // 12,50 € at 15 % = 1,875 € → 1,88 € off (half up); + a 20 € Product sold during the visit.
    const discounted = appointment({ discount: { type: 'PERCENT', percent: 15 } }, [12.5]);
    const linkedSale: Sale = {
      id: 'sale-a',
      businessId: 'business-a',
      clientId: 'client-a',
      appointmentId: 'appointment-a',
      completedAt: new Date(2026, 6, 20, 15, 0),
      items: [{ id: 'sale-a-0', productId: 'product-a', productName: 'Masque', unitPrice: 20, quantity: 1 }],
    };

    expect(getAppointmentCheckoutDueCents(discounted, [linkedSale], [])).toBe(1250 - 188 + 2000);
  });

  it('VOIDED deposits reduce nothing', () => {
    expect(
      getAppointmentCheckoutDueCents(appointment(), [], [deposit(3000, { status: 'VOIDED', voidedAt: new Date(2026, 6, 2) })]),
    ).toBe(10000);
  });
});

describe('a NEW final payment settles EXACTLY the checkout due', () => {
  const due100 = getDepositPositionFromTotals(10000, 0);

  it('accepts exactly the due, in any card / cash split', () => {
    expect(validateCheckoutAmounts(due100, split(10000))).toBeUndefined();
    expect(validateCheckoutAmounts(due100, split(3000, 7000))).toBeUndefined();
    expect(validateCheckoutAmounts(due100, split(0, 10000))).toBeUndefined();
  });

  it('refuses less — partial payment is not a V1 concept', () => {
    expect(validateCheckoutAmounts(due100, split(3000, 5000))).toBe('UNDER_DUE');
    expect(validateCheckoutAmounts(due100, split(9999))).toBe('UNDER_DUE');
  });

  it('refuses more — no tip, no positive « Écart »', () => {
    expect(validateCheckoutAmounts(due100, split(11000))).toBe('EXCEEDS_DUE');
    expect(validateCheckoutAmounts(due100, split(3000, 8000))).toBe('EXCEEDS_DUE');
    expect(validateCheckoutAmounts(due100, split(10001))).toBe('EXCEEDS_DUE');
  });

  it('refuses invalid cents', () => {
    expect(validateCheckoutAmounts(due100, split(-100, 10100))).toBe('INVALID_AMOUNT');
    expect(validateCheckoutAmounts(due100, split(99.5, 9900.5))).toBe('INVALID_AMOUNT');
  });

  it('a partial deposit lowers the maximum: 100 € with 30 € paid ahead settles 70 €, never 100 €', () => {
    const position = getDepositPositionFromTotals(10000, 3000);

    expect(getCheckoutPaymentBounds(position)).toEqual({ minimumCents: 7000, maximumCents: 7000 });
    expect(validateCheckoutAmounts(position, split(2000, 5000))).toBeUndefined();
    expect(validateCheckoutAmounts(position, split(10000))).toBe('EXCEEDS_DUE');
  });

  it('a full deposit leaves nothing to pay: no final payment at all, not even 0 €', () => {
    const prepaid = getDepositPositionFromTotals(10000, 10000);

    expect(getCheckoutPaymentBounds(prepaid)).toBeUndefined();
    expect(validateCheckoutAmounts(prepaid, split(0))).toBe('ALREADY_SETTLED');
    expect(validateCheckoutAmounts(prepaid, split(500))).toBe('ALREADY_SETTLED');
  });

  it('an Appointment that costs nothing (no deposit) settles 0 €', () => {
    expect(validateCheckoutAmounts(getDepositPositionFromTotals(0, 0), split(0))).toBeUndefined();
  });

  it('a COMPLETED Appointment without payment whose deposits cover everything is refused', () => {
    const completed = appointment({ status: 'COMPLETED' });

    expect(validateAppointmentCheckoutAmounts(completed, [], [deposit(10000)], split(0))).toBe('ALREADY_SETTLED');
  });

  it('an Appointment already paid can never be paid again', () => {
    const paid = appointment({
      status: 'COMPLETED',
      payment: { paidAt: new Date(2026, 6, 20, 15, 0), cardAmountCents: 10000, cashAmountCents: 0 },
    });

    expect(validateAppointmentCheckoutAmounts(paid, [], [], split(10000))).toBe('ALREADY_SETTLED');
  });
});

describe('a correction stays between the due and the recorded total', () => {
  const recordedAt = new Date(2026, 6, 20, 15, 0);

  it('an ordinary payment (recorded = due) stays exactly the due', () => {
    const paid = appointment({ status: 'COMPLETED', payment: { paidAt: recordedAt, ...split(10000) } });

    expect(validateAppointmentPaymentCorrection(paid, [], [], split(4000, 6000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(paid, [], [], split(10100))).toBe('EXCEEDS_DUE');
    expect(validateAppointmentPaymentCorrection(paid, [], [], split(9900))).toBe('UNDER_DUE');
  });

  it('a LEGACY overpaid payment (due 100 €, recorded 120 €) may be kept or lowered to the due, never raised', () => {
    const legacy = appointment({ status: 'COMPLETED', payment: { paidAt: recordedAt, ...split(12000) } });

    expect(getPaymentCorrectionBounds(getDepositPositionFromTotals(10000, 0), split(12000))).toEqual({
      minimumCents: 10000,
      maximumCents: 12000,
    });
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(12000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(11500))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(10000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(12500))).toBe('EXCEEDS_DUE');
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(9000))).toBe('UNDER_DUE');
  });

  it('the three correction ranges: legacy underpaid, legacy overpaid, ordinary', () => {
    const due100 = getDepositPositionFromTotals(10000, 0);

    expect(getPaymentCorrectionBounds(due100, split(6000))).toEqual({ minimumCents: 6000, maximumCents: 10000 });
    expect(getPaymentCorrectionBounds(due100, split(12000))).toEqual({ minimumCents: 10000, maximumCents: 12000 });
    expect(getPaymentCorrectionBounds(due100, split(10000))).toEqual({ minimumCents: 10000, maximumCents: 10000 });
  });

  it('a LEGACY underpaid payment (due 100 €, recorded 60 €) may be kept or raised to the due, never outside', () => {
    const legacy = appointment({ status: 'COMPLETED', payment: { paidAt: recordedAt, ...split(6000) } });

    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(6000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(3000, 5000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(10000))).toBeUndefined();
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(5900))).toBe('UNDER_DUE');
    expect(validateAppointmentPaymentCorrection(legacy, [], [], split(10100))).toBe('EXCEEDS_DUE');
  });

  it('there is nothing to correct without a payment', () => {
    expect(validateAppointmentPaymentCorrection(appointment({ status: 'COMPLETED' }), [], [], split(10000))).toBe(
      'NO_PAYMENT',
    );
  });
});

describe('the checkout discount of a COMPLETED Appointment without payment', () => {
  it('may change until the final payment exists, then is frozen', () => {
    expect(canChangeAppointmentCheckoutDiscount(appointment())).toBe(true);
    expect(canChangeAppointmentCheckoutDiscount(appointment({ status: 'COMPLETED' }))).toBe(true);
    expect(
      canChangeAppointmentCheckoutDiscount(
        appointment({ status: 'COMPLETED', payment: { paidAt: new Date(2026, 6, 20), ...split(10000) } }),
      ),
    ).toBe(false);
    expect(canChangeAppointmentCheckoutDiscount(appointment({ status: 'CANCELLED' }))).toBe(false);
    expect(canChangeAppointmentCheckoutDiscount(appointment({ status: 'NO_SHOW' }))).toBe(false);
  });

  it('lowers the due through THE discount — the generic editing rule itself is unchanged', () => {
    const completed = appointment({ status: 'COMPLETED' });
    const discounted = setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 10 });

    expect(getAppointmentCheckoutDueCents(discounted, [], [])).toBe(9000);
    // Outside checkout, a COMPLETED Appointment stays frozen.
    expect(setAppointmentDiscount(completed, { type: 'PERCENT', percent: 10 })).toBe(completed);
    expect(() => setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 60 })).toThrow(RangeError);
  });

  it('may not take the total below the deposits already received', () => {
    const completed = appointment({ status: 'COMPLETED' });
    const deposits = [deposit(9500)];

    expect(
      findAppointmentCheckoutDiscountShortfall({
        current: completed,
        candidate: setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 10 }),
        sales: [],
        deposits,
      }),
    ).toEqual({ activeDepositTotalCents: 9500, expectedTotalCents: 9000 });
    expect(
      findAppointmentCheckoutDiscountShortfall({
        current: completed,
        candidate: setAppointmentCheckoutDiscount(completed, { type: 'FIXED', amountCents: 500 }),
        sales: [],
        deposits,
      }),
    ).toBeUndefined();
  });
});

describe('« Encaissé le » — the payment date of a late checkout', () => {
  const july20 = appointment({ status: 'COMPLETED' }); // 20 July 2026, 14:00, 45 min
  const september28 = new Date(2026, 8, 28, 10, 30);

  it('is offered only for the first payment of an Appointment of an earlier local day', () => {
    expect(canChooseAppointmentPaymentDate(july20, september28)).toBe(true);
    expect(canChooseAppointmentPaymentDate(july20, new Date(2026, 6, 20, 23, 59))).toBe(false);
    expect(
      canChooseAppointmentPaymentDate(
        { ...july20, payment: { paidAt: september28, ...split(10000) } },
        september28,
      ),
    ).toBe(false);
  });

  it('« Jour du rendez-vous » dates the money at the end of the Appointment, on its local day', () => {
    const paidAt = getAppointmentPaymentInstant(july20, 'APPOINTMENT_DAY', september28);

    expect(paidAt).toEqual(new Date(2026, 6, 20, 14, 45));
    expect(getCashRegisterDayKey(paidAt)).toBe('2026-07-20');
  });

  it('« Aujourd’hui » — or a same-day checkout — dates it now', () => {
    expect(getAppointmentPaymentInstant(july20, 'TODAY', september28)).toEqual(september28);
    const sameDay = new Date(2026, 6, 20, 16, 0);
    expect(getAppointmentPaymentInstant(july20, 'APPOINTMENT_DAY', sameDay)).toEqual(sameDay);
  });

  it('an Appointment running past local midnight is dated 23:59 of its own day', () => {
    const late = appointment({ startAt: new Date(2026, 6, 20, 23, 30) });

    expect(getAppointmentDayPaymentInstant(late)).toEqual(new Date(2026, 6, 20, 23, 59));
  });

  it('stays on the appointment day across a DST change (Europe: 25 October 2026)', () => {
    const dstDay = appointment({ startAt: new Date(2026, 9, 25, 1, 30) });
    const paidAt = getAppointmentDayPaymentInstant(dstDay);

    expect(getCashRegisterDayKey(paidAt)).toBe('2026-10-25');
    expect(paidAt.getTime() - dstDay.startAt.getTime()).toBe(45 * 60_000);
  });

  it('the Caisse then counts it on 20 July — and never on 28 September — or the reverse for « Aujourd’hui »', () => {
    const onAppointmentDay = checkoutAppointment(
      july20,
      split(4000, 6000),
      september28,
      getAppointmentPaymentInstant(july20, 'APPOINTMENT_DAY', september28),
    );
    const today = checkoutAppointment(
      july20,
      split(4000, 6000),
      september28,
      getAppointmentPaymentInstant(july20, 'TODAY', september28),
    );
    const dayTotal = (appointmentWithPayment: Appointment, day: Date) =>
      getCashRegisterDaySummary({ appointments: [appointmentWithPayment], sales: [] }, day).totalCents;

    expect(dayTotal(onAppointmentDay, new Date(2026, 6, 20))).toBe(10000);
    expect(dayTotal(onAppointmentDay, september28)).toBe(0);
    expect(dayTotal(today, september28)).toBe(10000);
    expect(dayTotal(today, new Date(2026, 6, 20))).toBe(0);
  });
});

describe('a COMPLETED Appointment without payment settled by its deposits after a discount', () => {
  // 100 € expected, 70 € received ahead, completed without its final payment.
  const completed = appointment({ status: 'COMPLETED' });
  const deposits = [deposit(7000)];

  it('a discount bringing the total to exactly the deposits leaves nothing due: settled, no payment', () => {
    const candidate = setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 30 });
    const position = getAppointmentDepositPosition(candidate, [], deposits);

    expect(position).toEqual({ expectedTotalCents: 7000, activeDepositTotalCents: 7000, remainingCents: 0 });
    expect(canSettleCompletedAppointmentWithDeposits(candidate, position)).toBe(true);
    expect(validateAppointmentCheckoutAmounts(candidate, [], deposits, split(0))).toBe('ALREADY_SETTLED');
    expect(isAppointmentSettled(candidate, position)).toBe(true);
    expect(
      findAppointmentCheckoutDiscountShortfall({ current: completed, candidate, sales: [], deposits }),
    ).toBeUndefined();
  });

  it('a discount leaving 10 € due still requires the exact 10 € checkout', () => {
    const candidate = setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 20 });
    const position = getAppointmentDepositPosition(candidate, [], deposits);

    expect(position.remainingCents).toBe(1000);
    expect(canSettleCompletedAppointmentWithDeposits(candidate, position)).toBe(false);
    expect(validateAppointmentCheckoutAmounts(candidate, [], deposits, split(1000))).toBeUndefined();
    expect(validateAppointmentCheckoutAmounts(candidate, [], deposits, split(0))).toBe('UNDER_DUE');
  });

  it('a discount below the deposits stays refused', () => {
    const candidate = setAppointmentCheckoutDiscount(completed, { type: 'PERCENT', percent: 40 });

    expect(findAppointmentCheckoutDiscountShortfall({ current: completed, candidate, sales: [], deposits })).toEqual({
      activeDepositTotalCents: 7000,
      expectedTotalCents: 6000,
    });
  });

  it('never applies to a free Appointment without deposits (a 0 € checkout), an open one, or a paid one', () => {
    const free = getDepositPositionFromTotals(0, 0);
    const covered = getDepositPositionFromTotals(7000, 7000);

    expect(canSettleCompletedAppointmentWithDeposits(completed, free)).toBe(false);
    expect(validateCheckoutAmounts(free, split(0))).toBeUndefined();
    expect(canSettleCompletedAppointmentWithDeposits(appointment(), covered)).toBe(false);
    expect(
      canSettleCompletedAppointmentWithDeposits(
        { ...completed, payment: { paidAt: new Date(2026, 6, 20), ...split(0) } },
        covered,
      ),
    ).toBe(false);
  });
});
