// Souris — standalone Sale payment rules
//
// A Sale completed from Produits (« Nouvelle vente ») records how much was
// actually received by card and/or cash — tracking only, never processing.
// The cents representation and the amount rules are the SAME as the
// Appointment checkout (docs/domain/APPOINTMENTS.md §25b); nothing is
// duplicated here. A Sale sold during an Appointment (« Revente ») never
// carries a payment: the Appointment checkout records the full amount.

import {
  areValidPaymentAmounts,
  getPaymentTotalCents,
  isCheckoutTotalAcceptable,
  type AppointmentPaymentAmounts,
} from '../appointments/payment';

/** Card / cash cents recorded when a standalone Sale completes. */
export type SalePaymentAmounts = AppointmentPaymentAmounts;

export interface SalePayment extends SalePaymentAmounts {
  readonly paidAt: Date;
}

export { areValidPaymentAmounts as areValidSalePaymentAmounts };
export { getPaymentTotalCents as getSalePaymentTotalCents };

/**
 * A standalone Sale payment is acceptable when its amounts are valid cents
 * and, whenever the Sale total is positive, something was received. The
 * received total may otherwise differ from the Sale total (same tolerance
 * as the Appointment checkout).
 */
export function isSalePaymentAcceptable(
  saleTotalCents: number,
  amounts: SalePaymentAmounts,
): boolean {
  return (
    areValidPaymentAmounts(amounts) &&
    isCheckoutTotalAcceptable(saleTotalCents, getPaymentTotalCents(amounts))
  );
}
