// Souris — Product domain types
//
// Framework-independent canonical Product catalog model.
// No React, React Native, Expo, or persistence imports.
//
// V1 scope: professional-managed catalog + current stock. No Sales,
// checkout, purchase history, or supplier data yet.

export interface Product {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly brand?: string;
  /** Simple optional normalized text — no Category entity in V1. */
  readonly category?: string;
  /**
   * Optional string identifier. Never numeric-only: leading zeroes are
   * preserved and barcodes are always stored as text.
   */
  readonly barcode?: string;
  /** Optional local primary image for the current in-memory Product session. */
  readonly imageUri?: string;
  /** Souris money convention: finite number >= 0. */
  readonly price: number;
  /** Current stock in whole units: integer >= 0. */
  readonly stockQuantity: number;
  readonly active: boolean;
}
