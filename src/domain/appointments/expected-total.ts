// Souris — Appointment expected total (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25b
//
// THE canonical derivation of what one Appointment is expected to bring in,
// consumed by Appointment Details (« Total à encaisser ») and by the
// checkout sheet (« Total attendu ») so the two can never disagree:
//
//   servicesCents      Σ AppointmentItem snapshot prices
//   productsCents      Σ SaleItem snapshot lines of the Sales sold during
//                      the Appointment (sale.appointmentId === appointment.id)
//   expectedTotalCents servicesCents + productsCents
//
// Integer cents, snapshots only: the current Service and Product catalogs
// are never consulted. The expected total is a helper — the recorded
// payment is whatever the professional actually received, and the two may
// legitimately differ (discount, tip, or a Sale removed after checkout).

import type { Sale } from '../sales/types';
import { eurosToCents } from './payment';
import { getOrderedItems } from './timeline';
import type { Appointment } from './types';

export interface AppointmentExpectedTotal {
  readonly servicesCents: number;
  readonly productsCents: number;
  readonly expectedTotalCents: number;
}

/** Sales sold during the Appointment (« Revente »), in source order. */
export function getAppointmentLinkedSales(
  sales: readonly Sale[],
  appointmentId: string,
): readonly Sale[] {
  return sales.filter((sale) => sale.appointmentId === appointmentId);
}

/** Exact cents of one Sale, from its item snapshots. */
export function getSaleTotalCents(sale: Pick<Sale, 'items'>): number {
  return sale.items.reduce(
    (total, item) => total + eurosToCents(item.unitPrice) * item.quantity,
    0,
  );
}

export function getAppointmentExpectedTotal(
  appointment: Appointment,
  sales: readonly Sale[],
): AppointmentExpectedTotal {
  const servicesCents = getOrderedItems(appointment).reduce(
    (total, item) => total + eurosToCents(item.price),
    0,
  );
  const productsCents = getAppointmentLinkedSales(sales, appointment.id).reduce(
    (total, sale) => total + getSaleTotalCents(sale),
    0,
  );
  return { servicesCents, productsCents, expectedTotalCents: servicesCents + productsCents };
}
