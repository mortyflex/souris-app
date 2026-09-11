// Souris — Product catalog search and directory order
//
// Name/brand/category/barcode search over the canonical Product source.
// Case- and accent-insensitive substring matching; barcodes match exactly as
// entered (leading zeroes preserved). The source array is never mutated.

import type { Product } from '@/domain/products';

function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filters products by name, brand, category, or barcode. An empty query
 * returns no matches — the caller shows the grouped catalog instead.
 */
export function filterProducts(
  products: readonly Product[],
  query: string,
): readonly Product[] {
  const barcodeQuery = query.trim();
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  return products.filter((product) => {
    const textMatch = [product.name, product.brand ?? '', product.category ?? '']
      .map(normalizeForSearch)
      .some((value) => value.includes(normalizedQuery));
    return textMatch || product.barcode === barcodeQuery;
  });
}

/** Deterministic French alphabetical product order. Never mutates source. */
export function sortProductsByName(
  products: readonly Product[],
): readonly Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Search + deterministic order for the Products directory. */
export function prepareProductDirectory(
  products: readonly Product[],
  query: string,
): readonly Product[] {
  const matches = query.trim().length > 0 ? filterProducts(products, query) : products;
  return sortProductsByName(matches);
}

/**
 * EXACT barcode lookup. String semantics only — never numeric coercion,
 * leading zeroes preserved. Returns every matching Product (barcode
 * uniqueness is NOT a V1 domain rule). The source array is never mutated.
 */
export function findProductsByBarcode(
  products: readonly Product[],
  barcode: string,
): readonly Product[] {
  const trimmed = barcode.trim();
  if (trimmed.length === 0) return [];
  return products.filter((product) => product.barcode === trimmed);
}
