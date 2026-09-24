import type { Product, StockDecrement, StockRestoration } from '@/domain/products';

/**
 * An explicit photo decision of the Product form, applied on Save. Absent =
 * the Product keeps its photo as it is (shared `photoPath` and any legacy
 * local image). `replace` carries a LOCAL file just taken or chosen; it
 * becomes the ONE shared photo only once uploaded.
 */
export type ProductPhotoChange =
  | { readonly kind: 'replace'; readonly uri: string }
  | { readonly kind: 'remove' };

/**
 * The smallest Product session surface needed by Produits and Sales:
 * catalog reading/lookup, creation, immutable editing, activation state,
 * current-stock updates, and permanent deletion of erroneous records.
 *
 * `addProduct` and `updateProduct` are asynchronous because a new photo is
 * normalized and uploaded to the Business media storage before the row is
 * written. They reject with `ProductPhotoSaveError` — having written nothing —
 * when that photo cannot be stored.
 */
export interface ProductCatalogSessionValue {
  /** Complete management catalog, including inactive Products. */
  readonly products: readonly Product[];
  /** Active Products only — the Sale selection source. */
  readonly activeProducts: readonly Product[];
  readonly getProductById: (productId: string | undefined) => Product | undefined;
  /** Persists the Product (new shared photo included) then adds it; a duplicate id is a no-op. */
  readonly addProduct: (product: Product, photo?: ProductPhotoChange) => Promise<void>;
  /**
   * Replaces the editable fields of the Product with the same id; id/businessId
   * never change, and the photo changes only through `photo`.
   */
  readonly updateProduct: (product: Product, photo?: ProductPhotoChange) => Promise<void>;
  readonly setProductActive: (productId: string, active: boolean) => void;
  /** Direct current-stock state in V1 (no stock-movement history yet). */
  readonly setProductStock: (productId: string, stockQuantity: number) => void;
  /**
   * Reflects stock decrements ALREADY committed by Sale completion (one
   * SQLite transaction owned by the Sale session). Memory only — never call
   * it for decrements that were not persisted.
   */
  readonly applyCommittedStockDecrements: (decrements: readonly StockDecrement[]) => void;
  /**
   * Reflects stock restorations ALREADY committed by an Appointment-linked
   * Sale deletion (one SQLite transaction owned by the Sale session). Memory
   * only — never call it for restorations that were not persisted.
   */
  readonly applyCommittedStockRestorations: (restorations: readonly StockRestoration[]) => void;
  /** Removes the catalog record, its shared photo object and any legacy local image; unknown ids are a no-op. */
  readonly deleteProduct: (productId: string) => void;
}
