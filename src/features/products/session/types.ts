import type { Product } from '@/domain/products';

/**
 * The smallest in-memory Product session surface needed by Produits:
 * catalog reading/lookup, creation, immutable editing, activation state,
 * current-stock updates, and permanent deletion of erroneous records.
 */
export interface ProductCatalogSessionValue {
  /** Complete management catalog, including inactive Products. */
  readonly products: readonly Product[];
  /** Active Products only — the future Sales selection source. */
  readonly activeProducts: readonly Product[];
  readonly getProductById: (productId: string | undefined) => Product | undefined;
  readonly addProduct: (product: Product) => void;
  /** Replaces the Product with the same id; id/businessId never change. */
  readonly updateProduct: (product: Product) => void;
  readonly setProductActive: (productId: string, active: boolean) => void;
  /** Direct current-stock state in V1 (no stock-movement history yet). */
  readonly setProductStock: (productId: string, stockQuantity: number) => void;
  /** Removes the catalog record immutably; unknown ids are a no-op. */
  readonly deleteProduct: (productId: string) => void;
}
