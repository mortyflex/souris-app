import {
  canCheckoutAppointment,
  canDeleteAppointmentPermanently,
  canEditAppointmentPayment,
  checkoutAppointment,
  finalizePastBusinessDays,
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  isValidPaymentAmountCents,
  updateAppointmentPayment,
  type Appointment,
} from '..';

const now = new Date(2026, 8, 12, 15, 0);

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appointment-a',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 12, 14, 0),
    status: 'SCHEDULED',
    items: [
      {
        id: 'item-a',
        serviceId: 'service-cut',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 75,
        phases: [{ id: 'cut', name: 'Coupe', durationMinutes: 45, requiresStaff: true }],
      },
    ],
    ...overrides,
  };
}

describe('checkout amounts', () => {
  it('accepts non-negative integer cents only', () => {
    expect(isValidPaymentAmountCents(0)).toBe(true);
    expect(isValidPaymentAmountCents(7500)).toBe(true);
    expect(isValidPaymentAmountCents(-1)).toBe(false);
    expect(isValidPaymentAmountCents(75.5)).toBe(false);
    expect(isValidPaymentAmountCents(Number.NaN)).toBe(false);
  });

  it('derives the total with exact integer arithmetic', () => {
    expect(getPaymentTotalCents({ cardAmountCents: 5000, cashAmountCents: 2500 })).toBe(7500);
    expect(getPaymentTotalCents({ cardAmountCents: 1, cashAmountCents: 2 })).toBe(3);
  });

  it('requires a positive total unless the appointment costs nothing', () => {
    expect(isCheckoutTotalAcceptable(7500, 7500)).toBe(true);
    expect(isCheckoutTotalAcceptable(7500, 7000)).toBe(true);
    expect(isCheckoutTotalAcceptable(7500, 0)).toBe(false);
    expect(isCheckoutTotalAcceptable(0, 0)).toBe(true);
    expect(isCheckoutTotalAcceptable(0, 500)).toBe(true);
    expect(isCheckoutTotalAcceptable(7500, -1)).toBe(false);
  });
});

describe('checkoutAppointment', () => {
  it('records a card-only checkout and completes the appointment', () => {
    const result = checkoutAppointment(appointment(), { cardAmountCents: 7500, cashAmountCents: 0 }, now);

    expect(result.status).toBe('COMPLETED');
    expect(result.payment).toEqual({ paidAt: now, cardAmountCents: 7500, cashAmountCents: 0 });
    expect(result.payment?.paidAt).not.toBe(now);
  });

  it('records cash-only and mixed checkouts', () => {
    const cash = checkoutAppointment(appointment(), { cardAmountCents: 0, cashAmountCents: 7500 }, now);
    expect(cash.payment).toMatchObject({ cardAmountCents: 0, cashAmountCents: 7500 });

    const mixed = checkoutAppointment(appointment(), { cardAmountCents: 5000, cashAmountCents: 2500 }, now);
    expect(mixed.payment).toMatchObject({ cardAmountCents: 5000, cashAmountCents: 2500 });
    expect(getPaymentTotalCents(mixed.payment!)).toBe(7500);
  });

  it('rejects negative or fractional amounts before anything changes', () => {
    expect(() =>
      checkoutAppointment(appointment(), { cardAmountCents: -500, cashAmountCents: 0 }, now),
    ).toThrow(RangeError);
    expect(() =>
      checkoutAppointment(appointment(), { cardAmountCents: 10.5, cashAmountCents: 0 }, now),
    ).toThrow(RangeError);
  });

  it('is allowed once the appointment started, from every completable status', () => {
    expect(canCheckoutAppointment(appointment(), now)).toBe(true);
    expect(canCheckoutAppointment(appointment({ status: 'CONFIRMED' }), now)).toBe(true);
    expect(canCheckoutAppointment(appointment({ status: 'IN_PROGRESS' }), now)).toBe(true);
    expect(canCheckoutAppointment(appointment({ startAt: new Date(2026, 8, 12, 16) }), now)).toBe(false);
  });

  it('never applies to cancelled or no-show appointments', () => {
    const cancelled = appointment({
      status: 'CANCELLED',
      cancellation: { cancelledAt: now, cancelledBy: 'CLIENT' },
    });
    const noShow = appointment({ status: 'NO_SHOW', noShow: { recordedAt: now } });

    expect(canCheckoutAppointment(cancelled, now)).toBe(false);
    expect(canCheckoutAppointment(noShow, now)).toBe(false);
    expect(checkoutAppointment(cancelled, { cardAmountCents: 100, cashAmountCents: 0 }, now)).toBe(cancelled);
    expect(checkoutAppointment(noShow, { cardAmountCents: 100, cashAmountCents: 0 }, now)).toBe(noShow);
  });

  it('lets a completed appointment without payment record one afterwards, keeping its status', () => {
    const completed = appointment({ status: 'COMPLETED' });
    expect(canCheckoutAppointment(completed, now)).toBe(true);

    const result = checkoutAppointment(completed, { cardAmountCents: 7500, cashAmountCents: 0 }, now);
    expect(result.status).toBe('COMPLETED');
    expect(result.payment).toMatchObject({ cardAmountCents: 7500 });
  });

  it('never records a second payment on an already paid appointment', () => {
    const paid = checkoutAppointment(appointment(), { cardAmountCents: 7500, cashAmountCents: 0 }, now);
    expect(canCheckoutAppointment(paid, now)).toBe(false);
    expect(checkoutAppointment(paid, { cardAmountCents: 1, cashAmountCents: 0 }, now)).toBe(paid);
  });
});

describe('updateAppointmentPayment', () => {
  it('changes the split, keeps the status and the original paidAt, creates no duplicate', () => {
    const paid = checkoutAppointment(appointment(), { cardAmountCents: 5000, cashAmountCents: 2500 }, now);
    expect(canEditAppointmentPayment(paid)).toBe(true);

    const edited = updateAppointmentPayment(paid, { cardAmountCents: 3000, cashAmountCents: 4500 });

    expect(edited.status).toBe('COMPLETED');
    expect(edited.payment).toEqual({ paidAt: now, cardAmountCents: 3000, cashAmountCents: 4500 });
    expect(paid.payment).toEqual({ paidAt: now, cardAmountCents: 5000, cashAmountCents: 2500 });
  });

  it('does nothing without a recorded payment and rejects invalid amounts', () => {
    const unpaid = appointment({ status: 'COMPLETED' });
    expect(canEditAppointmentPayment(unpaid)).toBe(false);
    expect(updateAppointmentPayment(unpaid, { cardAmountCents: 1, cashAmountCents: 0 })).toBe(unpaid);

    const paid = checkoutAppointment(appointment(), { cardAmountCents: 5000, cashAmountCents: 2500 }, now);
    expect(() => updateAppointmentPayment(paid, { cardAmountCents: -1, cashAmountCents: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('automatic completion and payment', () => {
  it('completes a previous-day appointment WITHOUT recording any payment', () => {
    const yesterday = appointment({ startAt: new Date(2026, 8, 11, 14, 0) });

    const [finalized] = finalizePastBusinessDays([yesterday], now);

    expect(finalized?.status).toBe('COMPLETED');
    expect(finalized?.payment).toBeUndefined();
    expect('payment' in (finalized ?? {})).toBe(false);
  });

  it('keeps an existing payment untouched through reconciliation', () => {
    const paidYesterday = checkoutAppointment(
      appointment({ startAt: new Date(2026, 8, 11, 14, 0) }),
      { cardAmountCents: 7500, cashAmountCents: 0 },
      new Date(2026, 8, 11, 15, 0),
    );

    expect(finalizePastBusinessDays([paidYesterday], now)).toEqual([paidYesterday]);
  });
});

describe('permanent deletion guard', () => {
  it('refuses deletion once a payment or a linked Sale exists', () => {
    expect(canDeleteAppointmentPermanently({ hasPayment: false, saleCount: 0 })).toBe(true);
    expect(canDeleteAppointmentPermanently({ hasPayment: true, saleCount: 0 })).toBe(false);
    expect(canDeleteAppointmentPermanently({ hasPayment: false, saleCount: 1 })).toBe(false);
    expect(canDeleteAppointmentPermanently({ hasPayment: true, saleCount: 2 })).toBe(false);
  });
});
