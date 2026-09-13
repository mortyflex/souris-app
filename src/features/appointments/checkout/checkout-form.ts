// Souris — Appointment checkout expectation (pure)
//
// What the professional can expect to receive for one Appointment: the
// AppointmentItem snapshot prices plus the Products sold during it (Sale
// snapshots), both as exact cents. A UX helper only — the recorded amount is
// whatever the professional confirms. Entry parsing and validation live in
// the shared checkout form module.

import { eurosToCents, type Appointment } from '@/domain/appointments';
import type { Sale } from '@/domain/sales';
import { getAppointmentSnapshotTotal } from '@/features/appointments/presentation';
import { getAppointmentSalesTotal } from '@/features/sales/presentation';

export interface CheckoutExpectation {
  /** Sum of AppointmentItem snapshot prices, in cents. */
  readonly servicesCents: number;
  /** Sum of linked Product Sale snapshot lines, in cents. */
  readonly productsCents: number;
}

export function getExpectedTotalCents(expectation: CheckoutExpectation): number {
  return expectation.servicesCents + expectation.productsCents;
}

export function getCheckoutExpectation(
  appointment: Appointment,
  sales: readonly Sale[],
): CheckoutExpectation {
  return {
    servicesCents: eurosToCents(getAppointmentSnapshotTotal(appointment)),
    productsCents: eurosToCents(getAppointmentSalesTotal(sales, appointment.id)),
  };
}
