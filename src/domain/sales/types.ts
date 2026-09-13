// Souris — Sale domain types
//
// Framework-independent canonical Product Sale model.
// No React, React Native, Expo, or persistence imports.
//
// Sales V1 scope: COMPLETED Product sales only. There is no status, pending
// order, refund, discount, or tax concept. A standalone Sale may record the
// card / cash amounts actually received (tracking only, see payment.ts).

import type { SalePayment } from './payment';

/**
 * One historical line of a completed Sale.
 *
 * `productName` and `unitPrice` are SNAPSHOTS taken at completion time.
 * Later Product catalog edits (name, price, activation, image, deletion)
 * never rewrite a SaleItem — the line stays readable from its own fields.
 */
export interface SaleItem {
  readonly id: string;
  /** Stable Product identity at sale time; the Product may later disappear. */
  readonly productId: string;
  readonly productName: string;
  /** Souris money convention: finite number >= 0, snapshotted at completion. */
  readonly unitPrice: number;
  /** Whole units: integer >= 1. */
  readonly quantity: number;
}

/**
 * A completed, immutable Product sale.
 *
 * `clientId` is optional: a walk-in sale is a valid sale that affects stock
 * but appears on no Client Profile. The total is always derived from items.
 *
 * `appointmentId` is optional: a Sale opened from Appointment Details
 * (« Revente ») carries the Appointment it was sold during, so the
 * Appointment can list its Products; a Sale opened from Produits carries
 * none. It is plain reference metadata — the Sale stays valid history even
 * if the Appointment later disappears, and never resolves anything live.
 *
 * `payment` is optional and exists ONLY on standalone Sales (no
 * `appointmentId`): what was received by card / cash, in integer cents. A
 * Sale linked to an Appointment never carries one — the Appointment checkout
 * records the whole amount received, so the Cash Register never counts the
 * same money twice. Historical Sales without payment stay as they are.
 */
export interface Sale {
  readonly id: string;
  readonly businessId: string;
  readonly clientId?: string;
  readonly appointmentId?: string;
  readonly completedAt: Date;
  readonly items: readonly SaleItem[];
  readonly payment?: SalePayment;
}
