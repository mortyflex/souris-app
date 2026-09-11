// Souris — Sale domain types
//
// Framework-independent canonical Product Sale model.
// No React, React Native, Expo, or persistence imports.
//
// Sales V1 scope: COMPLETED Product sales only. There is no status, pending
// order, checkout, payment, refund, discount, or tax concept.

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
 */
export interface Sale {
  readonly id: string;
  readonly businessId: string;
  readonly clientId?: string;
  readonly completedAt: Date;
  readonly items: readonly SaleItem[];
}
