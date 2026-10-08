// BeautIzzy — Client spending (pure)
//
// THE definition of what an identified client spent with the business. One
// rule, two readers:
//
//   Client profile « Total dépensé »            the whole BeautIzzy history
//   Tops & tendances « Clients qui dépensent    the same amounts, scoped to
//   le plus »                                   one civil period
//
// The readers differ ONLY by their time scope, never by what counts:
//
//   A. COMPLETED Appointments of the client
//      `getAppointmentExpectedTotal`: services net of the discount + the Sales
//      sold during the Appointment (« Revente »). SCHEDULED, CONFIRMED,
//      IN_PROGRESS, CANCELLED and NO_SHOW Appointments are not money spent,
//      and neither are the Sales sold during them.
//
//   B. PAID standalone Sales of the client
//      a Sale with a `clientId`, no `appointmentId` and a recorded `payment`:
//      its snapshot total (unit price × quantity).
//
// A Sale sold during an Appointment counts ONLY through that Appointment —
// its checkout is what paid it — so never a second time as a Sale. A Sale
// without a client belongs to nobody. A standalone Sale without a recorded
// payment (historical) is not counted, exactly as the Caisse ignores it; no
// payment is ever invented for it. A deposit is a way of paying an
// Appointment, never extra spending.
//
// Integer cents, snapshots only: the current catalogs are never consulted.
// Nothing is stored on the Client.

import { getAppointmentExpectedTotal, getSaleTotalCents } from '../appointments/expected-total';
import type { Appointment } from '../appointments/types';
import type { Sale } from '../sales/types';

/**
 * What one Appointment adds to the spending of ITS client
 * (`appointment.clientId`): its expected total once COMPLETED, 0 otherwise.
 * `sales` may be every Sale or only the linked ones.
 */
export function getAppointmentClientSpendingCents(
  appointment: Appointment,
  sales: readonly Sale[],
): number {
  if (appointment.status !== 'COMPLETED') return 0;
  return getAppointmentExpectedTotal(appointment, sales).expectedTotalCents;
}

/**
 * What one Sale adds, ON ITS OWN, to the spending of `sale.clientId`: its
 * snapshot total when it is a paid standalone Sale of an identified client,
 * 0 otherwise (anonymous, unpaid, or sold during an Appointment).
 */
export function getSaleClientSpendingCents(sale: Sale): number {
  if (sale.clientId === undefined || sale.appointmentId !== undefined || !sale.payment) return 0;
  return getSaleTotalCents(sale);
}

export interface ClientSpendingSources {
  readonly appointments: readonly Appointment[];
  readonly sales: readonly Sale[];
}

/** Everything one client ever spent: rules A + B over the whole history. */
export function getClientTotalSpentCents(sources: ClientSpendingSources, clientId: string): number {
  let totalCents = 0;
  for (const appointment of sources.appointments) {
    if (appointment.clientId !== clientId) continue;
    totalCents += getAppointmentClientSpendingCents(appointment, sources.sales);
  }
  for (const sale of sources.sales) {
    if (sale.clientId !== clientId) continue;
    totalCents += getSaleClientSpendingCents(sale);
  }
  return totalCents;
}
