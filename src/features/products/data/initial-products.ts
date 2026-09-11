// Souris — Initial in-memory Product catalog
//
// The ONE canonical Product source for the current in-memory session:
// strictly-mapped legacy products only. Legacy files are one-way import
// sources; runtime features receive canonical Product values only.

import type { Product } from '@/domain/products';
import { DEVELOPMENT_BUSINESS_ID } from '@/features/services/data/initial-services';

import { mapLegacyProducts } from '../adapters/legacy-products-adapter';
import { products_list } from './legacy-products';

/** Builds a fresh, deterministic normalization result from the legacy file. */
export function createInitialProductImport() {
  return mapLegacyProducts(products_list, DEVELOPMENT_BUSINESS_ID);
}

/** Builds the canonical seed used by each in-memory catalog session. */
export function createInitialProductCatalog(): readonly Product[] {
  return createInitialProductImport().products;
}
