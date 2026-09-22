// Souris — Appointment expected total (pure)
//
// Source: docs/domain/APPOINTMENTS.md §25b
//
// THE canonical derivation of what one Appointment is expected to bring in,
// consumed by Appointment Details (« Total à encaisser ») and by the
// checkout sheet (« Total attendu ») so the two can never disagree:
//
//   servicesCents      Σ AppointmentItem snapshot prices (the GROSS amount)
//   discountCents      what the Appointment discount takes off the services
//                      (0 without a discount; never more than servicesCents)
//   productsCents      Σ SaleItem snapshot lines of the Sales sold during
//                      the Appointment (sale.appointmentId === appointment.id)
//   expectedTotalCents servicesCents − discountCents + productsCents
//
// The discount applies to the services only: a Product sold during the
// Appointment is its own Sale and keeps its snapshot price.
//
// `getAppointmentServicesTotal` is THE gross → discount → net derivation;
// every surface that shows a services amount (creation and editing drafts,
// Details, checkout, Client « Total dépensé ») reads it. Nothing recomputes
// a discount on its own.
//
// Integer cents, snapshots only: the current Service and Product catalogs
// are never consulted. The expected total is a helper — the recorded
// payment is whatever the professional actually received, and the two may
// legitimately differ (discount, tip, or a Sale removed after checkout).

import type { Sale, SaleItem } from '../sales/types';
import { getAppointmentDiscountCents } from './discount';
import { eurosToCents } from './payment';
import type { Appointment, AppointmentDiscount, AppointmentItem } from './types';

/** Services of one Appointment: gross → discount → net, in integer cents. */
export interface AppointmentServicesTotal {
  readonly grossCents: number;
  readonly discountCents: number;
  readonly netCents: number;
}

export interface AppointmentExpectedTotal {
  /** Gross services amount: the item snapshots, before any discount. */
  readonly servicesCents: number;
  readonly discountCents: number;
  readonly productsCents: number;
  readonly expectedTotalCents: number;
}

/**
 * Gross, applied discount and net of the Appointment's services, from the
 * item snapshots and the stored discount alone. Without a discount
 * `netCents === grossCents`, exactly the former services total.
 */
export function getAppointmentServicesTotal(appointment: {
  readonly items: readonly Pick<AppointmentItem, 'price'>[];
  readonly discount?: AppointmentDiscount;
}): AppointmentServicesTotal {
  const grossCents = appointment.items.reduce(
    (total, item) => total + eurosToCents(item.price),
    0,
  );
  const discountCents = getAppointmentDiscountCents(grossCents, appointment.discount);
  return { grossCents, discountCents, netCents: grossCents - discountCents };
}

/** Sales sold during the Appointment (« Revente »), in source order. */
export function getAppointmentLinkedSales(
  sales: readonly Sale[],
  appointmentId: string,
): readonly Sale[] {
  return sales.filter((sale) => sale.appointmentId === appointmentId);
}

/** Exact cents of one Sale, from its item snapshots (unit price × quantity). */
export function getSaleTotalCents(sale: {
  readonly items: readonly Pick<SaleItem, 'unitPrice' | 'quantity'>[];
}): number {
  return sale.items.reduce(
    (total, item) => total + eurosToCents(item.unitPrice) * item.quantity,
    0,
  );
}

export function getAppointmentExpectedTotal(
  appointment: Appointment,
  sales: readonly Sale[],
): AppointmentExpectedTotal {
  const services = getAppointmentServicesTotal(appointment);
  const productsCents = getAppointmentLinkedSales(sales, appointment.id).reduce(
    (total, sale) => total + getSaleTotalCents(sale),
    0,
  );
  return {
    servicesCents: services.grossCents,
    discountCents: services.discountCents,
    productsCents,
    expectedTotalCents: services.netCents + productsCents,
  };
}
