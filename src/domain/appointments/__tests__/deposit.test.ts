import type { Sale } from '../../sales/types';
import {
  AppointmentDepositInvalidError,
  canCompletePrepaidAppointment,
  canCorrectAppointmentDeposits,
  canRecordAppointmentDeposit,
  canVoidAppointmentDeposit,
  completePrepaidAppointment,
  createAppointmentDeposit,
  findAppointmentChangeDepositShortfall,
  findAppointmentDepositInvariantBreach,
  findAppointmentTotalChangeDepositShortfall,
  findDepositInvariantBreach,
  getActiveDepositTotalCents,
  getAppointmentActiveDepositTotal,
  getAppointmentDepositPosition,
  getAppointmentDeposits,
  getAppointmentRemainingAmount,
  getMaximumAppointmentDepositCents,
  isAppointmentSettled,
  validateAppointmentDeposit,
  validateAppointmentDepositAmount,
  voidAppointmentDeposit,
} from '../deposit';
import { canDeleteAppointmentPermanently } from '../payment';
import { removeAppointmentItem } from '../mutations';
import type { Appointment, AppointmentDeposit, AppointmentItem, AppointmentStatus } from '../types';

function item(id: string, price: number): AppointmentItem {
  return {
    id,
    serviceId: `service-${id}`,
    order: 0,
    serviceName: id,
    serviceType: 'SERVICE',
    price,
    phases: [{ id: `${id}-phase`, name: id, durationMinutes: 30, requiresStaff: true }],
  };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-a',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 9, 5, 10, 0),
    status: 'SCHEDULED',
    items: [item('color', 100)],
    ...overrides,
  };
}

function deposit(overrides: Partial<AppointmentDeposit> = {}): AppointmentDeposit {
  return {
    id: 'deposit-1',
    businessId: 'business-a',
    appointmentId: 'appointment-a',
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt: new Date(2026, 8, 22, 11, 0),
    status: 'ACTIVE',
    createdAt: new Date(2026, 8, 22, 11, 0),
    ...overrides,
  };
}

function linkedSale(cents: number): Sale {
  return {
    id: 'sale-linked',
    businessId: 'business-a',
    clientId: 'client-a',
    appointmentId: 'appointment-a',
    completedAt: new Date(2026, 9, 5, 10, 30),
    items: [{ id: 'line-1', productId: 'product-mask', productName: 'Masque', unitPrice: cents / 100, quantity: 1 }],
  };
}

const noSales: readonly Sale[] = [];

describe('Appointment deposits — totals', () => {
  it('zero deposits: nothing paid ahead, the whole expected total remains', () => {
    expect(getAppointmentDepositPosition(appointment(), noSales, [])).toEqual({
      expectedTotalCents: 10000,
      activeDepositTotalCents: 0,
      remainingCents: 10000,
    });
  });

  it('one deposit lowers what remains, never the expected total', () => {
    expect(getAppointmentDepositPosition(appointment(), noSales, [deposit()])).toEqual({
      expectedTotalCents: 10000,
      activeDepositTotalCents: 3000,
      remainingCents: 7000,
    });
  });

  it('several deposits add up; other Appointments’ deposits are ignored', () => {
    const deposits = [
      deposit({ id: 'd1', amountCents: 3000 }),
      deposit({ id: 'd2', amountCents: 2000, paymentMethod: 'CASH' }),
      deposit({ id: 'other', appointmentId: 'appointment-b', amountCents: 9000 }),
    ];
    expect(getAppointmentActiveDepositTotal(deposits, 'appointment-a')).toBe(5000);
    expect(getAppointmentRemainingAmount(appointment(), noSales, deposits)).toBe(5000);
  });

  it('VOIDED deposits count for nothing', () => {
    const deposits = [
      deposit({ id: 'd1', amountCents: 3000 }),
      deposit({ id: 'd2', amountCents: 2000, status: 'VOIDED', voidedAt: new Date(2026, 8, 23) }),
    ];
    expect(getActiveDepositTotalCents(deposits)).toBe(3000);
    expect(getAppointmentRemainingAmount(appointment(), noSales, deposits)).toBe(7000);
  });

  it('the expected total is THE canonical one: discount and linked Products included', () => {
    const discounted = appointment({ discount: { type: 'PERCENT', percent: 20 } });
    expect(getAppointmentDepositPosition(discounted, [linkedSale(1500)], [deposit()])).toEqual({
      expectedTotalCents: 9500,
      activeDepositTotalCents: 3000,
      remainingCents: 6500,
    });
  });

  it('remaining never goes below zero', () => {
    const over = [deposit({ amountCents: 12000 })];
    expect(getAppointmentRemainingAmount(appointment(), noSales, over)).toBe(0);
  });

  it('lists the deposits of one Appointment oldest first, VOIDED included', () => {
    const later = deposit({ id: 'later', paidAt: new Date(2026, 8, 25) });
    const earlier = deposit({ id: 'earlier', paidAt: new Date(2026, 8, 18), status: 'VOIDED', voidedAt: new Date(2026, 8, 19) });
    const foreign = deposit({ id: 'foreign', appointmentId: 'appointment-b' });
    expect(getAppointmentDeposits([later, foreign, earlier], 'appointment-a').map((d) => d.id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});

describe('Appointment deposits — validation', () => {
  it('accepts a deposit equal to the exact remaining amount', () => {
    expect(validateAppointmentDeposit(appointment(), noSales, [deposit()], 7000)).toBeUndefined();
    expect(getMaximumAppointmentDepositCents(appointment(), noSales, [deposit()])).toBe(7000);
  });

  it('refuses a deposit above the remaining amount', () => {
    expect(validateAppointmentDeposit(appointment(), noSales, [deposit()], 7001)).toBe('EXCEEDS_REMAINING');
  });

  it.each([0, -500, 12.5, Number.NaN])('refuses %p cents', (amountCents) => {
    expect(validateAppointmentDeposit(appointment(), noSales, [], amountCents)).toBe('INVALID_AMOUNT');
  });

  it.each<AppointmentStatus>(['COMPLETED', 'CANCELLED', 'NO_SHOW'])('refuses any deposit on a %s Appointment', (status) => {
    const frozen = appointment({ status });
    expect(validateAppointmentDeposit(frozen, noSales, [], 1000)).toBe('APPOINTMENT_NOT_OPEN');
    expect(canRecordAppointmentDeposit(frozen, noSales, [])).toBe(false);
    expect(getMaximumAppointmentDepositCents(frozen, noSales, [])).toBe(0);
  });

  it.each<AppointmentStatus>(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'])('accepts a deposit on a %s Appointment', (status) => {
    expect(validateAppointmentDeposit(appointment({ status }), noSales, [], 1000)).toBeUndefined();
    expect(canRecordAppointmentDeposit(appointment({ status }), noSales, [])).toBe(true);
  });

  it('offers no deposit once everything is paid ahead', () => {
    expect(canRecordAppointmentDeposit(appointment(), noSales, [deposit({ amountCents: 10000 })])).toBe(false);
  });

  it('the number-level rule is the same one', () => {
    expect(
      validateAppointmentDepositAmount({ status: 'SCHEDULED', expectedTotalCents: 5000, activeDepositTotalCents: 5000, amountCents: 1 }),
    ).toBe('EXCEEDS_REMAINING');
  });

  it('validates the shape of a record: positive cents, method, status ↔ voidedAt', () => {
    expect(createAppointmentDeposit(deposit())).toEqual(deposit());
    expect(() => createAppointmentDeposit(deposit({ amountCents: 0 }))).toThrow(AppointmentDepositInvalidError);
    expect(() => createAppointmentDeposit(deposit({ paymentMethod: 'CHEQUE' as never }))).toThrow(AppointmentDepositInvalidError);
    expect(() => createAppointmentDeposit(deposit({ voidedAt: new Date() }))).toThrow(AppointmentDepositInvalidError);
    expect(() => createAppointmentDeposit(deposit({ status: 'VOIDED' }))).toThrow(AppointmentDepositInvalidError);
    expect(() => createAppointmentDeposit(deposit({ appointmentId: ' ' }))).toThrow(AppointmentDepositInvalidError);
  });
});

describe('Appointment deposits — void (correction, not refund)', () => {
  const now = new Date(2026, 8, 23, 9, 0);

  it('voids an ACTIVE deposit of an open Appointment and keeps it as history', () => {
    const voided = voidAppointmentDeposit(deposit(), appointment(), now);
    expect(voided).toEqual({ ...deposit(), status: 'VOIDED', voidedAt: now });
    expect(getAppointmentRemainingAmount(appointment(), noSales, [voided])).toBe(10000);
  });

  it('never voids twice', () => {
    const voided = voidAppointmentDeposit(deposit(), appointment(), now);
    expect(voidAppointmentDeposit(voided, appointment(), now)).toBe(voided);
  });

  it.each<AppointmentStatus>(['CANCELLED', 'NO_SHOW'])(
    'corrects a mistaken entry on a %s Appointment — no new deposit, but the void stays possible',
    (status) => {
      const exception = appointment({ status });
      expect(canVoidAppointmentDeposit(deposit(), exception)).toBe(true);
      expect(canCorrectAppointmentDeposits(exception)).toBe(true);
      expect(voidAppointmentDeposit(deposit(), exception, now)).toEqual({
        ...deposit(),
        status: 'VOIDED',
        voidedAt: now,
      });
      // Creating one is still refused (§25d).
      expect(canRecordAppointmentDeposit(exception, noSales, [])).toBe(false);
      expect(validateAppointmentDeposit(exception, noSales, [], 1000)).toBe('APPOINTMENT_NOT_OPEN');
    },
  );

  it('a COMPLETED Appointment stays frozen: no deposit, no correction', () => {
    const completed = appointment({ status: 'COMPLETED' });
    expect(canCorrectAppointmentDeposits(completed)).toBe(false);
    expect(canVoidAppointmentDeposit(deposit(), completed)).toBe(false);
    expect(voidAppointmentDeposit(deposit(), completed, now)).toEqual(deposit());
    expect(canRecordAppointmentDeposit(completed, noSales, [])).toBe(false);
  });
});

describe('Appointment deposits — the invariant breach (cross-device merge)', () => {
  it('detects ACTIVE deposits above the expected total', () => {
    // 100 € appointment, 120 € of deposits: only a merge of two offline devices does this.
    const breach = findAppointmentDepositInvariantBreach(appointment(), noSales, [
      deposit({ amountCents: 12000 }),
    ]);
    expect(breach).toEqual({ expectedTotalCents: 10000, activeDepositTotalCents: 12000, excessCents: 2000 });
  });

  it('is silent when deposits equal the total, and VOIDED ones never breach', () => {
    expect(findAppointmentDepositInvariantBreach(appointment(), noSales, [deposit({ amountCents: 10000 })])).toBeUndefined();
    expect(
      findAppointmentDepositInvariantBreach(appointment(), noSales, [
        deposit({ amountCents: 12000, status: 'VOIDED', voidedAt: new Date(2026, 8, 23) }),
      ]),
    ).toBeUndefined();
  });

  it.each<AppointmentStatus>(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'])(
    'is a conflict to resolve on a %s Appointment',
    (status) => {
      expect(
        findAppointmentDepositInvariantBreach(appointment({ status }), noSales, [deposit({ amountCents: 12000 })]),
      ).toBeDefined();
    },
  );

  it('is NOT raised for a COMPLETED Appointment: that difference is the recorded Écart', () => {
    expect(
      findAppointmentDepositInvariantBreach(appointment({ status: 'COMPLETED' }), noSales, [
        deposit({ amountCents: 12000 }),
      ]),
    ).toBeUndefined();
    expect(
      findDepositInvariantBreach({ status: 'COMPLETED', expectedTotalCents: 1, activeDepositTotalCents: 99 }),
    ).toBeUndefined();
  });

  it('never reports a negative remaining amount: the position stays at zero and the breach carries the excess', () => {
    const deposits = [deposit({ amountCents: 12000 })];
    expect(getAppointmentDepositPosition(appointment(), noSales, deposits)).toEqual({
      expectedTotalCents: 10000,
      activeDepositTotalCents: 12000,
      remainingCents: 0,
    });
    expect(findAppointmentDepositInvariantBreach(appointment(), noSales, deposits)?.excessCents).toBe(2000);
  });

  it('is resolved by voiding a deposit — or by raising the total, which is never refused', () => {
    // 100 € appointment discounted to 50 € elsewhere, while 60 € was paid ahead.
    const deposits = [deposit({ id: 'd1', amountCents: 3000 }), deposit({ id: 'd2', amountCents: 3000 })];
    const broken = appointment({ items: [item('color', 100)], discount: { type: 'PERCENT', percent: 50 } });
    expect(findAppointmentDepositInvariantBreach(broken, noSales, deposits)).toBeDefined();

    const corrected = deposits.map((candidate) =>
      candidate.id === 'd2' ? voidAppointmentDeposit(candidate, broken, new Date(2026, 8, 24)) : candidate,
    );
    expect(findAppointmentDepositInvariantBreach(broken, noSales, corrected)).toBeUndefined();

    // Raising the total back is a change that does not lower it: never refused.
    const raised = appointment({ items: [item('color', 100)] });
    expect(
      findAppointmentChangeDepositShortfall({ current: broken, candidate: raised, sales: noSales, deposits }),
    ).toBeUndefined();
    expect(findAppointmentDepositInvariantBreach(raised, noSales, deposits)).toBeUndefined();
  });
});

describe('Appointment deposits — the invariant against later edits', () => {
  const sixty = [deposit({ amountCents: 6000 })];

  it('a discount taking the total below the deposits is refused', () => {
    const current = appointment();
    const candidate = appointment({ discount: { type: 'PERCENT', percent: 50 } });
    expect(findAppointmentChangeDepositShortfall({ current, candidate, sales: noSales, deposits: sixty })).toEqual({
      activeDepositTotalCents: 6000,
      expectedTotalCents: 5000,
    });
  });

  it('a discount keeping the total above the deposits is allowed', () => {
    const candidate = appointment({ discount: { type: 'PERCENT', percent: 20 } });
    expect(
      findAppointmentChangeDepositShortfall({ current: appointment(), candidate, sales: noSales, deposits: sixty }),
    ).toBeUndefined();
  });

  it('a lower price or a removed service below the deposits is refused', () => {
    const current = appointment({ items: [item('color', 100), { ...item('cut', 30), order: 1 }] });
    const cheaper = appointment({ items: [item('color', 20), { ...item('cut', 30), order: 1 }] });
    expect(findAppointmentChangeDepositShortfall({ current, candidate: cheaper, sales: noSales, deposits: sixty })).toBeDefined();
    const withoutColor = removeAppointmentItem(current, 'color');
    expect(
      findAppointmentChangeDepositShortfall({ current, candidate: withoutColor, sales: noSales, deposits: sixty }),
    ).toEqual({ activeDepositTotalCents: 6000, expectedTotalCents: 3000 });
  });

  it('a removed linked Product below the deposits is refused', () => {
    const current = appointment({ items: [item('color', 50)] });
    expect(
      findAppointmentChangeDepositShortfall({
        current,
        candidate: current,
        sales: [linkedSale(2000)],
        candidateSales: [],
        deposits: sixty,
      }),
    ).toEqual({ activeDepositTotalCents: 6000, expectedTotalCents: 5000 });
  });

  it('a change that does not lower the total is never refused, even when already inconsistent', () => {
    expect(
      findAppointmentTotalChangeDepositShortfall({
        status: 'SCHEDULED',
        previousExpectedTotalCents: 4000,
        nextExpectedTotalCents: 4000,
        activeDepositTotalCents: 6000,
      }),
    ).toBeUndefined();
    expect(
      findAppointmentTotalChangeDepositShortfall({
        status: 'SCHEDULED',
        previousExpectedTotalCents: 4000,
        nextExpectedTotalCents: 4500,
        activeDepositTotalCents: 6000,
      }),
    ).toBeUndefined();
  });

  it('only guards a financially open Appointment', () => {
    expect(
      findAppointmentTotalChangeDepositShortfall({
        status: 'COMPLETED',
        previousExpectedTotalCents: 10000,
        nextExpectedTotalCents: 1000,
        activeDepositTotalCents: 6000,
      }),
    ).toBeUndefined();
  });

  it('a total exactly equal to the deposits is fine', () => {
    const candidate = appointment({ discount: { type: 'FIXED', amountCents: 4000 } });
    expect(
      findAppointmentChangeDepositShortfall({ current: appointment(), candidate, sales: noSales, deposits: sixty }),
    ).toBeUndefined();
  });
});

describe('Appointment deposits — settlement and prepaid completion', () => {
  const started = new Date(2026, 9, 5, 12, 0);

  it('a fully prepaid Appointment completes WITHOUT a payment', () => {
    const paidAhead = [deposit({ amountCents: 10000 })];
    const position = getAppointmentDepositPosition(appointment(), noSales, paidAhead);
    expect(canCompletePrepaidAppointment(appointment(), position, started)).toBe(true);

    const completed = completePrepaidAppointment(appointment(), undefined, noSales, paidAhead, started);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.payment).toBeUndefined();
    expect(isAppointmentSettled(completed, position)).toBe(true);
  });

  it('is not a prepaid completion while something remains, before the start, or without deposits', () => {
    const partial = [deposit({ amountCents: 3000 })];
    expect(completePrepaidAppointment(appointment(), undefined, noSales, partial, started)).toEqual(appointment());
    const before = new Date(2026, 9, 5, 9, 0);
    const full = [deposit({ amountCents: 10000 })];
    expect(completePrepaidAppointment(appointment(), undefined, noSales, full, before)).toEqual(appointment());
    const free = appointment({ items: [item('free', 0)] });
    expect(completePrepaidAppointment(free, undefined, noSales, [], started)).toBe(free);
  });

  it('a final discount below the deposits is not a prepaid completion', () => {
    const full = [deposit({ amountCents: 10000 })];
    expect(
      completePrepaidAppointment(appointment(), { type: 'PERCENT', percent: 10 }, noSales, full, started),
    ).toEqual(appointment());
  });

  it('a recorded final payment settles; an auto-completed Appointment with money due does not', () => {
    const position = getAppointmentDepositPosition(appointment(), noSales, [deposit()]);
    expect(
      isAppointmentSettled(
        { status: 'COMPLETED', payment: { paidAt: started, cardAmountCents: 7000, cashAmountCents: 0 } },
        position,
      ),
    ).toBe(true);
    expect(isAppointmentSettled({ status: 'COMPLETED', payment: undefined }, position)).toBe(false);
  });

  it('a deposit — even VOIDED — blocks permanent deletion', () => {
    expect(canDeleteAppointmentPermanently({ hasPayment: false, saleCount: 0, depositCount: 1 })).toBe(false);
  });
});
