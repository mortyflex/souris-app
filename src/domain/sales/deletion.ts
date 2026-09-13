// Souris — Appointment-linked Product deletion (pure)
//
// Source: docs/domain/SALES.md §10
//
// From Appointment Details the professional removes a displayed PRODUCT row
// (« Shampoo ×2 »), not a Sale: every matching SaleItem snapshot of the
// Sales sold during that Appointment goes, the summed quantity returns to
// stock, and a parent Sale is dropped only once it holds no line any more.
// Sales that still contain other Products are preserved. Nothing here
// applies anything — the persistence boundary restores the stock and
// removes the lines in ONE transaction; this module decides what that
// operation means and what the session collection becomes afterwards.
//
// Eligibility is deliberately narrow: the matching lines must belong to
// Sales that carry an `appointmentId` and NO payment of their own. A
// standalone Sale records its own payment and is counted by the Cash
// Register; touching it would need a payment/Caisse decision this rule
// does not make.

import {
  isSameProductSnapshot,
  toAppointmentProductIdentity,
  type AppointmentProductIdentity,
} from '../appointments/linked-products';
import type { Sale } from './types';

/** Whole units to give back to one Product: integer >= 1. */
export interface ProductStockRestoration {
  readonly productId: string;
  readonly quantity: number;
}

export function isAppointmentLinkedSale(
  sale: Pick<Sale, 'appointmentId' | 'payment'>,
): boolean {
  return sale.appointmentId !== undefined && sale.payment === undefined;
}

export interface AppointmentProductRemoval {
  /** The exact quantity the deletion gives back, summed over every matching line. */
  readonly restoration: ProductStockRestoration;
  /** The Sale collection after the removal: lines filtered, emptied Sales dropped, others untouched. */
  readonly sales: readonly Sale[];
  /** Sales that held only the removed Product and therefore disappear. */
  readonly removedSaleIds: readonly string[];
  /** Sales that lost the Product but keep other lines. */
  readonly trimmedSaleIds: readonly string[];
}

export type AppointmentProductRemovalIssue =
  /** No Sale sold during the Appointment holds this Product snapshot. */
  | { readonly kind: 'PRODUCT_NOT_SOLD' }
  /** A matching Sale carries its own recorded payment (never expected for a linked Sale). */
  | { readonly kind: 'SALE_HAS_PAYMENT'; readonly saleId: string };

export type AppointmentProductRemovalResult =
  | { readonly ok: true; readonly removal: AppointmentProductRemoval }
  | { readonly ok: false; readonly issue: AppointmentProductRemovalIssue };

/**
 * Computes the removal of ONE displayed Product row from the Sales sold
 * during the Appointment. Returns a NEW collection; the input Sales and
 * their items are never mutated. Sales of other Appointments, standalone
 * Sales, and other Products of the same Sales are untouched by construction.
 */
export function removeAppointmentProduct(
  sales: readonly Sale[],
  appointmentId: string,
  identity: AppointmentProductIdentity,
): AppointmentProductRemovalResult {
  let quantity = 0;
  const removedSaleIds: string[] = [];
  const trimmedSaleIds: string[] = [];
  const next: Sale[] = [];

  for (const sale of sales) {
    if (sale.appointmentId !== appointmentId) {
      next.push(sale);
      continue;
    }
    const matching = sale.items.filter((item) =>
      isSameProductSnapshot(toAppointmentProductIdentity(item), identity),
    );
    if (matching.length === 0) {
      next.push(sale);
      continue;
    }
    if (!isAppointmentLinkedSale(sale)) {
      return { ok: false, issue: { kind: 'SALE_HAS_PAYMENT', saleId: sale.id } };
    }
    quantity += matching.reduce((sum, item) => sum + item.quantity, 0);
    const remaining = sale.items.filter((item) => !matching.includes(item));
    if (remaining.length === 0) {
      removedSaleIds.push(sale.id);
    } else {
      trimmedSaleIds.push(sale.id);
      next.push({ ...sale, items: remaining });
    }
  }

  if (quantity === 0) return { ok: false, issue: { kind: 'PRODUCT_NOT_SOLD' } };

  return {
    ok: true,
    removal: {
      restoration: { productId: identity.productId, quantity },
      sales: next,
      removedSaleIds,
      trimmedSaleIds,
    },
  };
}
