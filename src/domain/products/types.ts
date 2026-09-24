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
  /**
   * AUTHORITATIVE Product photo: the stable object path of the image in the
   * Business media storage (opaque). Shared by every device of the Business;
   * never a device file URI, a signed URL or image bytes.
   */
  readonly photoPath?: string;
  /**
   * LEGACY device-local image (a file under this device's documents), from
   * builds that predate `photoPath`. Never synced, never uploaded, display-only
   * while the Product has no `photoPath` — a `photoPath` always wins.
   */
  readonly imageUri?: string;
  /** Souris money convention: finite number >= 0. */
  readonly price: number;
  /** Current stock in whole units: integer >= 0. */
  readonly stockQuantity: number;
  readonly active: boolean;
}
