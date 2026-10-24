import {
  MAX_DISCOUNT_PERCENT,
  areAppointmentDiscountsEqual,
  getAppointmentDiscountCents,
  isValidAppointmentDiscount,
  setAppointmentDiscount,
} from '../discount';
import { getAppointmentExpectedTotal, getAppointmentServicesTotal } from '../expected-total';
import type { Sale } from '../../sales/types';
import type { Appointment, AppointmentDiscount, AppointmentItem } from '../types';

function item(id: string, price: number, order = 0): AppointmentItem {
  return { id, serviceId: id, order, serviceName: id, serviceType: 'SERVICE', price, phases: [] };
}

function appointmentOf(prices: readonly number[], discount?: AppointmentDiscount): Appointment {
  return {
    id: 'appointment-1',
    businessId: 'business-a',
    clientId: 'client-a',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 12, 14, 0),
    status: 'SCHEDULED',
    items: prices.map((price, index) => item(`item-${index}`, price, index)),
    ...(discount ? { discount } : {}),
  };
}

const percent = (value: number): AppointmentDiscount => ({ type: 'PERCENT', percent: value });
const fixed = (amountCents: number): AppointmentDiscount => ({ type: 'FIXED', amountCents });

describe('Appointment discount — pricing', () => {
  it('leaves the total unchanged without a discount', () => {
    expect(getAppointmentServicesTotal(appointmentOf([60, 40]))).toEqual({
      grossCents: 10000,
      discountCents: 0,
      netCents: 10000,
    });
  });

  it.each([
    [5, 500, 9500],
    [20, 2000, 8000],
    [50, 5000, 5000],
  ])('applies a %i %% discount to the whole services total', (value, discountCents, netCents) => {
    expect(getAppointmentServicesTotal(appointmentOf([60, 40], percent(value)))).toEqual({
      grossCents: 10000,
      discountCents,
      netCents,
    });
  });

  it.each([
    [500, 9500],
    [5000, 5000],
  ])('applies a fixed %i c discount', (amountCents, netCents) => {
    expect(getAppointmentServicesTotal(appointmentOf([60, 40], fixed(amountCents)))).toEqual({
      grossCents: 10000,
      discountCents: amountCents,
      netCents,
    });
  });

  it('clamps a fixed discount larger than the gross total: the net is zero', () => {
    expect(getAppointmentServicesTotal(appointmentOf([30], fixed(5000)))).toEqual({
      grossCents: 3000,
      discountCents: 3000,
      netCents: 0,
    });
  });

  it('applies freely chosen values exactly like the presets: custom cents and custom whole percentages', () => {
    // 3 €, 7,50 € and 12,90 € typed by the professional.
    expect(getAppointmentServicesTotal(appointmentOf([60, 40], fixed(300)))).toMatchObject({ discountCents: 300, netCents: 9700 });
    expect(getAppointmentServicesTotal(appointmentOf([60, 40], fixed(750)))).toMatchObject({ discountCents: 750, netCents: 9250 });
    expect(getAppointmentServicesTotal(appointmentOf([60, 40], fixed(1290)))).toMatchObject({ discountCents: 1290, netCents: 8710 });
    // 7 % of 12,90 € = 90,3 c → 90 c ; 33 % of 10 € = 330 c ; 1 % of 0,49 € = 0,49 c → 0 c.
    expect(getAppointmentDiscountCents(1290, percent(7))).toBe(90);
    expect(getAppointmentDiscountCents(1000, percent(33))).toBe(330);
    expect(getAppointmentDiscountCents(49, percent(1))).toBe(0);
    // 7,50 € off a 7,50 € Appointment: nothing left, nothing negative.
    expect(getAppointmentServicesTotal(appointmentOf([7.5], fixed(750)))).toEqual({
      grossCents: 750,
      discountCents: 750,
      netCents: 0,
    });
    // A fixed amount on a zero-value or empty Appointment applies nothing.
    expect(getAppointmentServicesTotal(appointmentOf([0], fixed(750)))).toEqual({ grossCents: 0, discountCents: 0, netCents: 0 });
    expect(getAppointmentServicesTotal(appointmentOf([], percent(7)))).toEqual({ grossCents: 0, discountCents: 0, netCents: 0 });
  });

  it('rounds a percentage half up to the cent, deterministically, in integer arithmetic', () => {
    // 12,50 € × 15 % = 187,5 c → 188 c
    expect(getAppointmentDiscountCents(1250, percent(15))).toBe(188);
    // 0,33 € × 5 % = 1,65 c → 2 c ; 0,29 € × 5 % = 1,45 c → 1 c
    expect(getAppointmentDiscountCents(33, percent(5))).toBe(2);
    expect(getAppointmentDiscountCents(29, percent(5))).toBe(1);
    // 0,10 € × 5 % = 0,5 c → 1 c (the half goes up)
    expect(getAppointmentDiscountCents(10, percent(5))).toBe(1);
    // A euro snapshot that is not exact in binary still yields exact cents.
    expect(getAppointmentServicesTotal(appointmentOf([75.29], percent(35)))).toEqual({
      grossCents: 7529,
      discountCents: 2635, // 2635,15
      netCents: 4894,
    });
    // Same input, same output.
    expect(getAppointmentDiscountCents(1250, percent(15))).toBe(
      getAppointmentDiscountCents(1250, percent(15)),
    );
  });

  it('never produces a negative net total, whatever the gross and the discount', () => {
    const discounts = [percent(1), percent(25), percent(50), fixed(1), fixed(500), fixed(1_000_000)];
    for (const grossCents of [0, 1, 99, 500, 3000, 123_456]) {
      for (const discount of discounts) {
        const applied = getAppointmentDiscountCents(grossCents, discount);
        expect(applied).toBeGreaterThanOrEqual(0);
        expect(applied).toBeLessThanOrEqual(grossCents);
        expect(Number.isInteger(applied)).toBe(true);
      }
    }
  });

  it('discounts the services only: Products sold during the Appointment keep their snapshot price', () => {
    const sale: Sale = {
      id: 'sale-a',
      businessId: 'business-a',
      clientId: 'client-a',
      appointmentId: 'appointment-1',
      completedAt: new Date(2026, 8, 12, 15, 0),
      items: [{ id: 'a0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 20, quantity: 1 }],
    };
    expect(getAppointmentExpectedTotal(appointmentOf([100], percent(20)), [sale])).toEqual({
      servicesCents: 10000,
      discountCents: 2000,
      productsCents: 2000,
      expectedTotalCents: 10000,
    });
  });

  it('services 100 € at 20 % plus 15 € of Products is expected at 95 €; a clamped fixed discount still leaves the Products', () => {
    const product: Sale = {
      id: 'sale-b',
      businessId: 'business-a',
      clientId: 'client-a',
      appointmentId: 'appointment-1',
      completedAt: new Date(2026, 8, 12, 15, 0),
      items: [{ id: 'b0', productId: 'mask', productName: 'Mask', unitPrice: 15, quantity: 1 }],
    };
    expect(getAppointmentExpectedTotal(appointmentOf([100], percent(20)), [product]).expectedTotalCents).toBe(9500);
    expect(getAppointmentExpectedTotal(appointmentOf([30], fixed(5000)), [product])).toEqual({
      servicesCents: 3000,
      discountCents: 3000,
      productsCents: 1500,
      expectedTotalCents: 1500,
    });
  });

  it('refuses invalid inputs instead of computing a wrong amount', () => {
    expect(() => getAppointmentDiscountCents(-1, percent(10))).toThrow(RangeError);
    expect(() => getAppointmentDiscountCents(10.5, percent(10))).toThrow(RangeError);
    expect(() => getAppointmentDiscountCents(1000, percent(0))).toThrow(RangeError);
    expect(() => getAppointmentDiscountCents(1000, percent(51))).toThrow(RangeError);
    expect(() => getAppointmentDiscountCents(1000, fixed(-500))).toThrow(RangeError);
  });
});

describe('Appointment discount — validity', () => {
  it('accepts whole percentages 1–50 and positive integer cents', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(50);
    expect(isValidAppointmentDiscount(percent(1))).toBe(true);
    expect(isValidAppointmentDiscount(percent(50))).toBe(true);
    expect(isValidAppointmentDiscount(fixed(1))).toBe(true);
    expect(isValidAppointmentDiscount(fixed(5000))).toBe(true);
  });

  it('refuses zero, negative, fractional, out-of-range and non-finite values', () => {
    for (const value of [0, -5, 12.5, 51, 100, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidAppointmentDiscount(percent(value))).toBe(false);
    }
    for (const value of [0, -500, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidAppointmentDiscount(fixed(value))).toBe(false);
    }
  });
});

describe('setAppointmentDiscount — THE discount action', () => {
  it('adds, changes and removes the discount of an editable Appointment without mutating it', () => {
    const base = appointmentOf([100]);
    const withPercent = setAppointmentDiscount(base, percent(20));
    expect(withPercent.discount).toEqual(percent(20));
    expect(base.discount).toBeUndefined();

    const withFixed = setAppointmentDiscount(withPercent, fixed(1500));
    expect(withFixed.discount).toEqual(fixed(1500));

    const cleared = setAppointmentDiscount(withFixed, undefined);
    expect(cleared.discount).toBeUndefined();
    expect('discount' in cleared).toBe(false);
  });

  it('never touches the item snapshot prices', () => {
    const base = appointmentOf([60, 40]);
    expect(setAppointmentDiscount(base, percent(50)).items).toEqual(base.items);
  });

  it.each(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const)('is allowed while %s', (status) => {
    const next = setAppointmentDiscount({ ...appointmentOf([100]), status }, percent(10));
    expect(next.discount).toEqual(percent(10));
  });

  it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
    'returns the SAME Appointment once %s: financial history is never rewritten',
    (status) => {
      const terminal: Appointment = { ...appointmentOf([100], percent(20)), status };
      expect(setAppointmentDiscount(terminal, percent(50))).toBe(terminal);
      expect(setAppointmentDiscount(terminal, undefined)).toBe(terminal);
    },
  );

  it('throws on an invalid discount so it never reaches persistence', () => {
    expect(() => setAppointmentDiscount(appointmentOf([100]), percent(51))).toThrow(RangeError);
    expect(() => setAppointmentDiscount(appointmentOf([100]), percent(100))).toThrow(RangeError);
    expect(() => setAppointmentDiscount(appointmentOf([100]), fixed(0))).toThrow(RangeError);
  });
});

describe('areAppointmentDiscountsEqual', () => {
  it('compares type and value', () => {
    expect(areAppointmentDiscountsEqual(undefined, undefined)).toBe(true);
    expect(areAppointmentDiscountsEqual(percent(20), percent(20))).toBe(true);
    expect(areAppointmentDiscountsEqual(fixed(2000), fixed(2000))).toBe(true);
    expect(areAppointmentDiscountsEqual(percent(20), undefined)).toBe(false);
    expect(areAppointmentDiscountsEqual(percent(20), percent(25))).toBe(false);
    expect(areAppointmentDiscountsEqual(percent(20), fixed(20))).toBe(false);
  });
});
