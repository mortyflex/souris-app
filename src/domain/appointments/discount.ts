// Souris — Appointment discount (pure)
//
// Source: docs/domain/APPOINTMENTS.md §15.3
//
// ONE optional discount per Appointment, applied to the WHOLE services
// total — never to an individual AppointmentItem, whose snapshot price is
// left untouched:
//
//   gross (Σ item snapshot prices) → discount → net
//
// The discount is stored as what the professional chose (a percentage, or a
// fixed amount in integer cents), never as a pre-computed total: the applied
// cents are always derived here, from the snapshot gross. A discount has no
// origin or reason — a birthday discount is this same generic discount.
//
// Integer arithmetic only; nothing here formats or parses money.

import { canEditAppointment } from './lifecycle';
import type { Appointment, AppointmentDiscount } from './types';

/**
 * A percentage is a whole number of percent, 1–50. ONE bound for the domain,
 * the SQLite and Supabase CHECKs and the sync validation: a percentage above
 * it is never a valid Souris discount.
 */
export const MAX_DISCOUNT_PERCENT = 50;

export function isValidAppointmentDiscount(discount: AppointmentDiscount): boolean {
  if (discount.type === 'PERCENT') {
    return (
      Number.isInteger(discount.percent) &&
      discount.percent >= 1 &&
      discount.percent <= MAX_DISCOUNT_PERCENT
    );
  }
  return Number.isSafeInteger(discount.amountCents) && discount.amountCents >= 1;
}

/**
 * The cents actually taken off `grossCents`, always within `[0, grossCents]`
 * so the net total can never become negative:
 *
 *   PERCENT  grossCents × percent / 100, rounded HALF UP to the cent with
 *            integer arithmetic (12,50 € at 15 % = 187,5 c → 188 c)
 *   FIXED    the chosen amount, clamped to the gross (50 € off 30 € → 30 €)
 */
export function getAppointmentDiscountCents(
  grossCents: number,
  discount: AppointmentDiscount | undefined,
): number {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) {
    throw new RangeError(`getAppointmentDiscountCents: ${grossCents} is not a non-negative integer number of cents`);
  }
  if (discount === undefined) return 0;
  if (!isValidAppointmentDiscount(discount)) {
    throw new RangeError(`getAppointmentDiscountCents: invalid ${discount.type} discount`);
  }
  const requested =
    discount.type === 'PERCENT'
      ? Math.floor((grossCents * discount.percent + 50) / 100)
      : discount.amountCents;
  return Math.min(requested, grossCents);
}

/**
 * THE discount action — the Appointment editor uses it, and any later
 * surface that proposes a discount (a birthday prompt) must use it too.
 * `undefined` removes the discount. Follows the ONE editing eligibility
 * rule: a terminal Appointment (COMPLETED, CANCELLED, NO_SHOW) is returned
 * unchanged, so financial history is never rewritten. Throws on an invalid
 * discount so a broken value never reaches persistence.
 */
export function setAppointmentDiscount(
  appointment: Appointment,
  discount: AppointmentDiscount | undefined,
): Appointment {
  if (discount !== undefined && !isValidAppointmentDiscount(discount)) {
    throw new RangeError(`setAppointmentDiscount: invalid ${discount.type} discount`);
  }
  if (!canEditAppointment(appointment)) return appointment;

  const { discount: _previous, ...rest } = appointment;
  return discount === undefined ? rest : { ...rest, discount: { ...discount } };
}

export function areAppointmentDiscountsEqual(
  a: AppointmentDiscount | undefined,
  b: AppointmentDiscount | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.type === 'PERCENT') return b.type === 'PERCENT' && a.percent === b.percent;
  return b.type === 'FIXED' && a.amountCents === b.amountCents;
}
