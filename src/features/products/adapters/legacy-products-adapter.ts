// Souris — Legacy products adapter
//
// Source: src/features/products/data/legacy-products.ts
// Target: canonical Product (src/domain/products/types.ts)
//
// One-way import: legacy files are seed sources only and never become
// runtime product APIs. Only fields with approved canonical meaning are
// mapped; historical/sales/implementation fields are discarded.

import type { Product } from '@/domain/products';
import {
  isValidProductPrice,
  normalizeBarcode,
  normalizeOptionalText,
} from '@/domain/products';

export interface LegacyProduct {
  readonly _id: string;
  readonly title: string;
  readonly type?: string;
  readonly brand?: string;
  readonly line?: string;
  readonly barcode?: string;
  readonly capacity?: string;
  readonly price: number;
}

export interface ProductImportDiagnostic {
  readonly name: string;
  readonly reason: string;
}

export interface LegacyProductsAdapterResult {
  readonly products: readonly Product[];
  readonly diagnostics: readonly ProductImportDiagnostic[];
}

/**
 * Deterministic French category normalization from the legacy type buckets.
 * Unknown bucket values map truthfully to their raw text — nothing is
 * invented.
 */
const CATEGORY_BY_LEGACY_TYPE: Readonly<Record<string, string>> = {
  'hair-care': 'Soin',
  shampoo: 'Shampooing',
  colouring: 'Coloration',
  styling: 'Coiffage',
};

export function mapLegacyProductCategory(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const trimmed = type.trim();
  if (trimmed.length === 0) return undefined;
  return CATEGORY_BY_LEGACY_TYPE[trimmed] ?? trimmed;
}

/**
 * Normalizes one legacy product record.
 *
 * Mapping rules:
 * - _id → id (stable, preserved verbatim)
 * - title → name (required; blank titles are excluded with a diagnostic)
 * - brand → brand (optional text)
 * - type → category (deterministic French bucket mapping)
 * - barcode → barcode (optional STRING, leading zeroes preserved)
 * - price → price (must be finite >= 0; otherwise excluded with a diagnostic)
 * - stockQuantity: legacy has NO stock data → seeded at 0 (current stock
 *   starts at zero until the professional enters real counts)
 * - active: legacy has NO archive state → seeded active
 * - line, capacity and any other legacy-only fields: discarded
 *
 * The source record is never mutated.
 */
export function normalizeLegacyProduct(
  legacy: LegacyProduct,
  businessId: string,
): Product | null {
  const name = legacy.title.trim();
  if (name.length === 0) {
    return null;
  }
  if (typeof legacy.price !== 'number' || !isValidProductPrice(legacy.price)) {
    return null;
  }

  return {
    id: legacy._id,
    businessId,
    name,
    brand: normalizeOptionalText(legacy.brand),
    category: mapLegacyProductCategory(legacy.type),
    barcode: normalizeBarcode(legacy.barcode),
    price: legacy.price,
    stockQuantity: 0,
    active: true,
  };
}

/**
 * Batch-normalizes the legacy dataset. Deterministic, immutable input,
 * explicit diagnostics for excluded records.
 */
export function mapLegacyProducts(
  legacyProducts: readonly LegacyProduct[],
  businessId: string,
): LegacyProductsAdapterResult {
  const products: Product[] = [];
  const diagnostics: ProductImportDiagnostic[] = [];

  for (const legacy of legacyProducts) {
    const normalized = normalizeLegacyProduct(legacy, businessId);
    if (normalized) {
      products.push(normalized);
    } else if (legacy.title.trim().length === 0) {
      diagnostics.push({ name: legacy.title, reason: 'Missing product name' });
    } else {
      const reason =
        typeof legacy.price !== 'number' || Number.isNaN(legacy.price)
          ? `Non-numeric price: ${legacy.price}`
          : `Invalid product price: ${legacy.price}`;
      diagnostics.push({
        name: legacy.title,
        reason,
      });
    }
  }

  return { products, diagnostics };
}
