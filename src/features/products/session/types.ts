import type { Product, StockDecrement, StockRestoration } from '@/domain/products';

/**
 * The smallest Product session surface needed by Produits and Sales:
 * catalog reading/lookup, creation, immutable editing, activation state,
 * current-stock updates, and permanent deletion of erroneous records.
 *
 * `addProduct` and `updateProduct` are asynchronous because a draft image is
 * promoted into durable app storage (a file copy) before the row is written.
 */
export interface ProductCatalogSessionValue {
  /** Complete management catalog, including inactive Products. */
  readonly products: readonly Product[];
  /** Active Products only — the Sale selection source. */
  readonly activeProducts: readonly Product[];
  readonly getProductById: (productId: string | undefined) => Product | undefined;
  /** Persists the Product (durable image included) then adds it; a duplicate id is a no-op. */
  readonly addProduct: (product: Product) => Promise<void>;
  /** Replaces the Product with the same id; id/businessId never change. */
  readonly updateProduct: (product: Product) => Promise<void>;
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
  /** Removes the catalog record and its Souris-owned image; unknown ids are a no-op. */
  readonly deleteProduct: (productId: string) => void;
}
